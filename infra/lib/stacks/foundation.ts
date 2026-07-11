import { CfnOutput, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as ce from 'aws-cdk-lib/aws-ce';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';

/**
 * AWS Budgets are denominated in USD; the owner's budget is set in AUD
 * (config.budgets.monthlyAud). Convert with a pinned, deliberately
 * conservative constant: 0.60 USD per AUD sits at the bottom of the
 * currency's modern range, so the resulting USD ceiling understates the AUD
 * allowance at any realistic exchange rate and the alerts trip early, never
 * late. Flagged for owner review; revisit the constant only if the AUD trades
 * below 0.60 for a sustained period.
 */
export const AUD_TO_USD_BUDGET_RATE = 0.6;

/** The five runtime feature flags (spec §3): /app/{env}/features/{flag}. */
export const FEATURE_FLAGS = ['api', 'ingestion', 'extraction', 'sync', 'auth'] as const;

export interface FoundationStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * Foundation (spec §3, Phase 0): the cost guardrails and shared plumbing that
 * must exist before anything can spend. SNS alert topic, monthly AWS Budget
 * with staged notifications, Cost Explorer anomaly detection, and the SSM
 * runtime feature flags. Stateless; no compute.
 *
 * Deliberately absent in Phase 0: the killSwitchFlipper Lambda (spec §8) that
 * flips /app/{env}/features/extraction to 'false' at the killSwitchAt
 * threshold. It arrives with Phase 2 alongside the first component that can
 * spend meaningfully; until then the 100% notification is a human alert only,
 * and this stack keeps the Phase 1 promise of zero compute.
 */
export class FoundationStack extends Stack {
  readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);
    const { config } = props;

    // --- Alert topic -----------------------------------------------------
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `plainsight-${config.envName}-alerts`,
      displayName: `Plainsight ${config.envName} cost and operations alerts`,
    });

    // One explicit TopicPolicy carries all three statements: the TLS-only
    // deny (enforceSSL) plus publish grants for the two AWS services that
    // deliver to this topic. Budgets and Cost Explorer publish as service
    // principals and are refused without these grants.
    const alertTopicPolicy = new sns.TopicPolicy(this, 'AlertTopicPolicy', {
      topics: [this.alertTopic],
      enforceSSL: true,
    });
    const publishers: ReadonlyArray<[sid: string, service: string]> = [
      ['AllowBudgetsPublish', 'budgets.amazonaws.com'],
      ['AllowCostAnomalyPublish', 'costalerts.amazonaws.com'],
    ];
    for (const [sid, service] of publishers) {
      alertTopicPolicy.document.addStatements(
        new iam.PolicyStatement({
          sid,
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal(service)],
          actions: ['sns:Publish'],
          resources: [this.alertTopic.topicArn],
          // Confused-deputy guard: only deliveries originating from this
          // account may publish.
          conditions: { StringEquals: { 'aws:SourceAccount': config.account } },
        }),
      );
    }

    Validations.of(this.alertTopic).acknowledge({
      id: 'AwsSolutions-SNS2',
      reason:
        'No server-side encryption on the alert topic: Budgets and Cost Explorer cannot use the ' +
        'AWS-managed SNS key (delivery would silently fail), a customer-managed KMS key is on the ' +
        'spec §8 not-list (ADR 0004), and the payloads are cost alerts about a personal account, ' +
        'not sensitive data.',
    });

    // --- Monthly cost budget (spec §8) ------------------------------------
    // L1 CfnBudget: aws-cdk-lib ships no L2 for AWS Budgets (spec §5 rule:
    // L1 only where no L2 exists).
    const monthlyUsd = Math.round(config.budgets.monthlyAud * AUD_TO_USD_BUDGET_RATE * 100) / 100;
    const monthlyBudget = new budgets.CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetName: `plainsight-${config.envName}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        // See AUD_TO_USD_BUDGET_RATE above: the conversion deliberately trips
        // early, never late.
        budgetLimit: { amount: monthlyUsd, unit: 'USD' },
      },
      // Staged notifications at 50/80/100% of actual spend (spec §8). In
      // Phase 2 the killSwitchFlipper Lambda subscribes to the topic and acts
      // at config.budgets.killSwitchAt percent; the notifications themselves
      // do not change.
      notificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'SNS', address: this.alertTopic.topicArn }],
      })),
    });
    // Budgets validates it can publish at create time; the grant must land first.
    monthlyBudget.node.addDependency(alertTopicPolicy);

    // --- Cost anomaly detection (spec §8) ----------------------------------
    // L1s: aws-cdk-lib ships no L2 for Cost Explorer anomaly detection.
    // Prod only: AWS allows exactly one DIMENSIONAL anomaly monitor per
    // account, so a rehearsal copy must not attempt a second; the prod
    // monitor keeps watching while a rehearsal copy exists. This is a hard
    // service quota, not an environment branch by preference.
    if (config.envName === 'prod') {
      const anomalyMonitor = new ce.CfnAnomalyMonitor(this, 'CostAnomalyMonitor', {
        monitorName: 'plainsight-account-services',
        monitorType: 'DIMENSIONAL',
        monitorDimension: 'SERVICE',
      });
      const anomalySubscription = new ce.CfnAnomalySubscription(this, 'CostAnomalySubscription', {
        subscriptionName: 'plainsight-anomaly-alerts',
        // IMMEDIATE delivery requires an SNS subscriber; that is exactly the
        // wiring spec §8 asks for (same topic as the budget alerts).
        frequency: 'IMMEDIATE',
        monitorArnList: [anomalyMonitor.attrMonitorArn],
        subscribers: [{ type: 'SNS', address: this.alertTopic.topicArn }],
        // Threshold is in USD (Cost Explorer's currency). USD 5 of anomalous
        // impact is loud on a bill whose steady state is close to zero.
        thresholdExpression: JSON.stringify({
          Dimensions: {
            Key: 'ANOMALY_TOTAL_IMPACT_ABSOLUTE',
            MatchOptions: ['GREATER_THAN_OR_EQUAL'],
            Values: ['5'],
          },
        }),
      });
      anomalySubscription.node.addDependency(alertTopicPolicy);
    }

    // --- Runtime feature flags (spec §3) -----------------------------------
    // Plain String parameters: CloudFormation cannot create SecureStrings,
    // and these hold no secrets, only 'true'/'false'. The canonical
    // pipeline's provider keys are SecureStrings created out-of-band and
    // referenced by name (spec §1.4, ADR 0003); they never appear in CDK.
    for (const flag of FEATURE_FLAGS) {
      new ssm.StringParameter(this, `FeatureFlag-${flag}`, {
        parameterName: `/app/${config.envName}/features/${flag}`,
        stringValue: 'false',
        description:
          `Runtime feature flag for ${flag}. Phase 0 default is 'false'; later phases flip it, ` +
          'and the Phase 2 budget kill switch flips extraction back off at threshold (spec §8).',
      });
    }

    new CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS topic receiving budget and cost-anomaly alerts; subscribe an email to it.',
    });
  }
}
