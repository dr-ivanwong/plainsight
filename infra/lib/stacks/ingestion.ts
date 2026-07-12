import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { edgarContactParameterName, LOG_RETENTION, TICKER_INDEX_OBJECT_KEY } from '../constants';
import { AppFunction, handlerEntry } from '../constructs/app-function';
import { acknowledgeNagFinding } from '../nag';
import { WATCHED_TICKERS_INDEX } from './data';

export interface IngestionStackProps extends StackProps {
  config: EnvConfig;
  table: dynamodb.ITable;
  /** Foundation's alert topic; the DLQ-depth and sweep-failure alarms publish to it. */
  alertTopic: sns.ITopic;
}

/**
 * Ingestion (spec §3, Phase 2): the on-demand ingest function in this slice;
 * the weekly sweep machinery (EventBridge, Step Functions, DLQ, alarms) joins
 * it next. X-Ray runs here and only here (main plan §6): the ingestion path
 * is where multi-hop debugging will actually happen.
 */
export class IngestionStack extends Stack {
  readonly ingestFunction: lambda.IFunction;
  /** The pipeline's derived artefacts (the search index copy); rebuildable, never precious. */
  readonly indexBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: IngestionStackProps) {
    super(scope, id, props);
    const { config, table, alertTopic } = props;

    const contactParameter = edgarContactParameterName(config.envName);

    this.indexBucket = new s3.Bucket(this, 'IndexBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // A weekly-replaced copy of a public file: keep a week of history, and
      // never RETAIN (rebuildable from the SEC in one request; retention
      // would only preserve a stale copy).
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(7) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });
    acknowledgeNagFinding(
      this.indexBucket,
      'AwsSolutions-S1',
      'No server access logging: spec §8 not-list (ADR 0004). The bucket holds a weekly copy ' +
        'of a public SEC index file; an access-log bucket would only grow and watch nothing.',
    );

    const ingest = new AppFunction(this, 'IngestTicker', {
      entry: handlerEntry('ingestTicker'),
      description:
        'On-demand EDGAR ingest: fetch companyfacts, map, gate, write; idempotent per ticker via the profile lock (backend spec §5).',
      // Fetch plus normalise for one ticker (backend spec §10 sizing).
      timeout: Duration.seconds(120),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        EDGAR_CONTACT_PARAMETER: contactParameter,
      },
    });
    this.ingestFunction = ingest.fn;

    // The ingestion path owns every write, and only in ticker partitions
    // (spec §6: single-table access scoped by key-prefix conditions where
    // sensible). No deletes exist anywhere: served data is only ever
    // overwritten by a newer ingest.
    ingest.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'WriteTickerPartitions',
        actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:BatchWriteItem'],
        resources: [table.tableArn],
        conditions: {
          'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['TICKER#*'] },
        },
      }),
    );
    ingest.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ReadEdgarContactParameter',
        actions: ['ssm:GetParameter'],
        resources: [
          this.formatArn({ service: 'ssm', resource: `parameter${contactParameter}` }),
        ],
      }),
    );

    // Active tracing adds the X-Ray daemon-write statement on Resource '*',
    // the documented CDK-managed exception (spec §6): those write actions
    // support no resource-level scoping. The invariant suite recognises the
    // exact action pair; cdk-nag needs the acknowledgement spelt out, on the
    // construct that holds both the function and its role.
    acknowledgeNagFinding(
      ingest,
      'AwsSolutions-IAM5[Resource::*]',
      'X-Ray daemon writes (PutTraceSegments, PutTelemetryRecords) support no resource-level ' +
        'scoping; tracing is deliberately on for the ingestion path only (main plan §6).',
    );

    // --- The weekly sweep (backend spec §5) --------------------------------

    // Failed sweep items land here with their error, for the runbook's drain
    // procedure; the depth alarm is the signal. 14 days of retention buys two
    // sweep cycles of investigation time.
    const sweepDlq = new sqs.Queue(this, 'SweepDlq', {
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    acknowledgeNagFinding(
      sweepDlq,
      'AwsSolutions-SQS3',
      'This queue IS the dead-letter destination for sweep failures (backend spec §5); a DLQ ' +
        'for the DLQ would recurse to nowhere.',
    );

    const sweepTicker = new tasks.LambdaInvoke(this, 'SweepTicker', {
      lambdaFunction: ingest.fn,
      payloadResponseOnly: true,
    });
    // Per-item retry then catch (cdk spec §3): a poisoned ticker goes to the
    // DLQ with its error and the map moves on; blast radius is that company.
    sweepTicker.addRetry({
      errors: ['States.ALL'],
      interval: Duration.seconds(30),
      backoffRate: 2,
      maxAttempts: 2,
    });
    const sendToDlq = new tasks.SqsSendMessage(this, 'SendToDlq', {
      queue: sweepDlq,
      messageBody: sfn.TaskInput.fromObject({
        ticker: sfn.JsonPath.stringAt('$.ticker'),
        error: sfn.JsonPath.stringAt('$.error.Cause'),
      }),
    });
    sweepTicker.addCatch(sendToDlq, { errors: ['States.ALL'], resultPath: '$.error' });

    const sweepMap = new sfn.Map(this, 'SweepEachTicker', {
      itemsPath: '$.tickers',
      // Concurrency 2 paces ingest writes under the provisioned ceiling
      // (cdk spec §3; the free-tier arithmetic in the Data stack).
      maxConcurrency: 2,
      itemSelector: {
        ticker: sfn.JsonPath.stringAt('$$.Map.Item.Value'),
        mode: 'sweep',
      },
    });
    sweepMap.itemProcessor(sweepTicker);

    const sweepLogs = new logs.LogGroup(this, 'SweepLogs', {
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const stateMachine = new sfn.StateMachine(this, 'SweepStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(sweepMap),
      timeout: Duration.hours(1),
      tracingEnabled: true,
      logs: { destination: sweepLogs, level: sfn.LogLevel.ALL },
    });
    acknowledgeNagFinding(
      stateMachine,
      'AwsSolutions-IAM5[Resource::*]',
      'X-Ray tracing on the state machine (the traced ingestion path, main plan §6): the ' +
        'daemon-write and sampling-read actions support no resource-level scoping.',
    );
    acknowledgeNagFinding(
      stateMachine,
      `AwsSolutions-IAM5[Resource::<${this.getLogicalId(ingest.fn.node.defaultChild as lambda.CfnFunction)}.Arn>:*]`,
      "CDK's Lambda task integration grants version-qualified invoke (the ':*' suffix) of " +
        'exactly the one ingest function; nothing broader is reachable.',
    );

    const dispatcher = new AppFunction(this, 'SweepDispatcher', {
      entry: handlerEntry('sweepDispatcher'),
      description:
        'Weekly sweep dispatcher: refresh the search index copy, list watched tickers, start the sweep map (backend spec §5, §8, §10).',
      timeout: Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        WATCH_INDEX_NAME: WATCHED_TICKERS_INDEX,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        EDGAR_CONTACT_PARAMETER: contactParameter,
        INDEX_BUCKET: this.indexBucket.bucketName,
        INDEX_KEY: TICKER_INDEX_OBJECT_KEY,
      },
    });
    stateMachine.grantStartExecution(dispatcher.fn);
    dispatcher.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'QueryWatchedTickers',
        actions: ['dynamodb:Query'],
        resources: [`${table.tableArn}/index/${WATCHED_TICKERS_INDEX}`],
        conditions: {
          'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['WATCH'] },
        },
      }),
    );
    dispatcher.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'RefreshTickerIndexObject',
        actions: ['s3:PutObject'],
        resources: [this.indexBucket.arnForObjects(TICKER_INDEX_OBJECT_KEY)],
      }),
    );
    dispatcher.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ReadEdgarContactParameter',
        actions: ['ssm:GetParameter'],
        resources: [this.formatArn({ service: 'ssm', resource: `parameter${contactParameter}` })],
      }),
    );

    // Weekly, Sunday 19:00 UTC: Monday morning in Sydney, matching the drift
    // job's cadence. Annual reports change at most weekly per ticker (main
    // plan §6); a nightly sweep would pay for freshness nobody uses.
    new events.Rule(this, 'WeeklySweep', {
      schedule: events.Schedule.cron({ minute: '0', hour: '19', weekDay: 'SUN' }),
      targets: [new eventsTargets.LambdaFunction(dispatcher.fn)],
    });

    // Symptom-based alarms only (backend spec §11), to the Foundation topic.
    new cloudwatch.Alarm(this, 'SweepDlqDepthAlarm', {
      alarmDescription: 'Sweep dead-letter queue holds at least one failed ticker; run the drain procedure.',
      metric: sweepDlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    new cloudwatch.Alarm(this, 'SweepFailedAlarm', {
      alarmDescription: 'The weekly sweep execution failed outright.',
      metric: stateMachine.metricFailed({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    new CfnOutput(this, 'IngestFunctionName', {
      value: ingest.fn.functionName,
      description: 'The on-demand ingest function; the financials route fires it on cold tickers.',
    });
    new CfnOutput(this, 'SweepStateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'The weekly sweep; start it by hand to rehearse the runbook.',
    });
  }
}
