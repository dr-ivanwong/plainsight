import { createHash } from 'node:crypto';

import { CfnOutput, Duration, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as ce from 'aws-cdk-lib/aws-ce';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { AppFunction, handlerEntry } from '../constructs/app-function';

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

    // --- The budget kill switch (spec §8; backend spec §10) ----------------
    // Gated with the first phase that can spend meaningfully: prod keeps the
    // Phase 0/1 zero-compute promise until a feature flips. The flipper
    // subscribes to a dedicated topic that only the kill-threshold budget
    // notification publishes to, so delivery IS the signal and the handler
    // parses nothing.
    const spendCapable =
      config.features.api || config.features.ingestion || config.features.extraction;
    let killSwitchTopicPolicy: sns.TopicPolicy | undefined;
    let killSwitchTopic: sns.Topic | undefined;
    if (spendCapable) {
      killSwitchTopic = new sns.Topic(this, 'KillSwitchTopic', {
        topicName: `plainsight-${config.envName}-kill-switch`,
        displayName: `Plainsight ${config.envName} budget kill switch`,
      });
      killSwitchTopicPolicy = new sns.TopicPolicy(this, 'KillSwitchTopicPolicy', {
        topics: [killSwitchTopic],
        enforceSSL: true,
      });
      killSwitchTopicPolicy.document.addStatements(
        new iam.PolicyStatement({
          sid: 'AllowBudgetsPublish',
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
          actions: ['sns:Publish'],
          resources: [killSwitchTopic.topicArn],
          conditions: { StringEquals: { 'aws:SourceAccount': config.account } },
        }),
      );
      Validations.of(killSwitchTopic).acknowledge({
        id: 'AwsSolutions-SNS2',
        reason:
          'No server-side encryption: Budgets cannot use the AWS-managed SNS key (delivery ' +
          'would silently fail), a customer-managed key is on the spec §8 not-list (ADR 0004), ' +
          'and the payload is a budget threshold notification.',
      });

      const extractionFlagParameter = `/app/${config.envName}/features/extraction`;
      const flipper = new AppFunction(this, 'KillSwitchFlipper', {
        entry: handlerEntry('killSwitchFlipper'),
        description:
          'Flips the runtime extraction flag to false at the budget kill threshold (cdk spec §8).',
        timeout: Duration.seconds(30),
        memorySize: 128,
        environment: {
          EXTRACTION_FLAG_PARAMETER: extractionFlagParameter,
          // The flipper relays the kill event to the alert topic in words:
          // Budgets allows one SNS subscriber per notification, so the kill
          // threshold cannot also notify the alert topic directly.
          ALERT_TOPIC_ARN: this.alertTopic.topicArn,
        },
      });
      flipper.fn.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'FlipExtractionFlag',
          actions: ['ssm:PutParameter'],
          resources: [
            this.formatArn({ service: 'ssm', resource: `parameter${extractionFlagParameter}` }),
          ],
        }),
      );
      this.alertTopic.grantPublish(flipper.fn);
      killSwitchTopic.addSubscription(new snsSubscriptions.LambdaSubscription(flipper.fn));
    }

    // --- Monthly cost budget (spec §8) ------------------------------------
    // L1 CfnBudget: aws-cdk-lib ships no L2 for AWS Budgets (spec §5 rule:
    // L1 only where no L2 exists).
    const monthlyUsd = Math.round(config.budgets.monthlyAud * AUD_TO_USD_BUDGET_RATE * 100) / 100;
    // Staged notifications at 50/80/100% of actual spend to the alert topic
    // (spec §8), plus the kill switch at killSwitchAt percent once anything
    // can spend. Two service rules shape the wiring, both invisible to
    // template tests and enforced only at deploy: Budgets keys a
    // notification by its threshold alone (a duplicate threshold is
    // rejected), and each notification carries at most one SNS subscriber.
    // So the kill threshold's notification goes to the kill topic alone,
    // taking its threshold's slot; the flipper relays the event to the
    // alert topic in words, which is how the owner still hears about it.
    const topicByThreshold = new Map<number, string>(
      [50, 80, 100].map((threshold) => [threshold, this.alertTopic.topicArn]),
    );
    if (killSwitchTopic !== undefined) {
      topicByThreshold.set(config.budgets.killSwitchAt, killSwitchTopic.topicArn);
    }
    const notificationsWithSubscribers = [...topicByThreshold.entries()]
      .sort(([a], [b]) => a - b)
      .map(([threshold, address]) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'SNS', address }],
      }));
    const monthlyBudget = new budgets.CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetName: `plainsight-${config.envName}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        // See AUD_TO_USD_BUDGET_RATE above: the conversion deliberately trips
        // early, never late.
        budgetLimit: { amount: monthlyUsd, unit: 'USD' },
        // The account is shared with the owner's other project tenants
        // (ADR 0001, amendment 2026-07-18): the budget counts this project's
        // tagged spend, never theirs. The scoping bites once the
        // cost-allocation tag is activated (runbook, go-live step 8).
        // 'user:project', prefixed, unlike the anomaly monitor's bare
        // 'project' below: Budgets requires the user: prefix on user-defined
        // tag keys (its filter documentation), Cost Explorer expressions
        // take the bare key. The asymmetry is each service's documented
        // form, not a typo; the runbook's tag-activation step verifies both
        // against real spend.
        filterExpression: {
          tags: { key: 'user:project', values: ['plainsight'], matchOptions: ['EQUALS'] },
        },
      },
      notificationsWithSubscribers,
    });
    // Budgets validates it can publish at create time; the grants must land first.
    monthlyBudget.node.addDependency(alertTopicPolicy);
    if (killSwitchTopicPolicy !== undefined) monthlyBudget.node.addDependency(killSwitchTopicPolicy);

    // --- Cost anomaly detection (spec §8) ----------------------------------
    // L1s: aws-cdk-lib ships no L2 for Cost Explorer anomaly detection.
    // CUSTOM and tag-scoped, not account-wide: the account is shared with
    // the owner's other project tenants (ADR 0001, amendment 2026-07-18),
    // the one-per-account DIMENSIONAL slot already belongs to the account's
    // existing monitor, and every tenant here watches its own project tag.
    // Prod only: a rehearsal copy's resources carry the same project tag, so
    // its spend already lands inside this monitor's scope.
    if (config.envName === 'prod') {
      // Plain 'project', not the budget's 'user:project': the two services
      // disagree on tag-key form, and each side of this file follows its own
      // service's documentation. Cost Explorer expressions take the bare key
      // (every tag-monitor example in the CreateAnomalyMonitor API
      // reference); a prefixed key would be read literally, match no spend,
      // and the monitor would watch nothing, silently.
      const monitorSpecification = JSON.stringify({
        Tags: { Key: 'project', Values: ['plainsight'], MatchOptions: ['EQUALS'] },
      });
      // The name carries a short digest of the specification. MonitorSpecification
      // is create-only, so any change to it forces a replacement, and
      // CloudFormation replaces create-before-delete; Cost Anomaly Detection
      // rejects a second monitor whose name already exists, so a fixed name
      // makes the incoming monitor collide with the one still being torn
      // down (HandlerErrorCode: AlreadyExists, which is exactly how the first
      // deploy of this key fix failed). Rotating the name with the spec keeps
      // every such replacement a clean one pass, while a deterministic digest
      // (no timestamp, no randomness) keeps the name stable whenever the spec
      // is unchanged. The subscription tracks the monitor by ARN, updating
      // with no interruption, so the rotation never touches it.
      const monitorDigest = createHash('sha256').update(monitorSpecification).digest('hex').slice(0, 8);
      const anomalyMonitor = new ce.CfnAnomalyMonitor(this, 'CostAnomalyMonitor', {
        monitorName: `plainsight-project-costs-${monitorDigest}`,
        monitorType: 'CUSTOM',
        monitorSpecification,
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
