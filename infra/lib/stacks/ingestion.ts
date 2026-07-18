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
import {
  ASX_DIRECTORY_OBJECT_KEY,
  distributionIdParameterName,
  edgarContactParameterName,
  extractionParameterPrefix,
  LOG_RETENTION,
  TICKER_INDEX_OBJECT_KEY,
} from '../constants';
import { AppFunction, handlerEntry } from '../constructs/app-function';
import { acknowledgeNagFinding } from '../nag';
import { uploadsObjectsArn, uploadsObjectsFindingArn, WATCHED_TICKERS_INDEX } from './data';

export interface IngestionStackProps extends StackProps {
  config: EnvConfig;
  table: dynamodb.ITable;
  /** Foundation's alert topic; the DLQ-depth and sweep-failure alarms publish to it. */
  alertTopic: sns.ITopic;
  /** The Data stack's uploads bucket; wired when the Phase 3 surface is on. */
  uploadsBucket?: s3.IBucket;
}

/**
 * Ingestion (spec §3, Phase 2): the on-demand ingest function in this slice;
 * the weekly sweep machinery (EventBridge, Step Functions, DLQ, alarms) joins
 * it next. X-Ray runs here and only here (main plan §6): the ingestion path
 * is where multi-hop debugging will actually happen.
 */
export class IngestionStack extends Stack {
  readonly ingestFunction: lambda.IFunction;
  /** The extraction worker; the upload-job route fires it (backend spec §6). */
  readonly extractFunction: lambda.IFunction;
  /** The pipeline's derived artefacts (the search index copy); rebuildable, never precious. */
  readonly indexBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: IngestionStackProps) {
    super(scope, id, props);
    const { config, table, alertTopic, uploadsBucket } = props;

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

    const distributionParameter = distributionIdParameterName(config.envName);
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
        DISTRIBUTION_ID_PARAMETER: distributionParameter,
      },
    });
    this.ingestFunction = ingest.fn;

    // Edge invalidation after accepted writes (backend spec §5). The
    // distribution id arrives at runtime via the parameter StaticSite
    // publishes (see constants.ts: StaticSite sits downstream of Api, so no
    // deploy-time reference can exist in this direction), which forces the
    // invalidation grant onto the distribution wildcard: the account has
    // exactly one distribution, and invalidation is a cache lever, not a
    // data-plane risk.
    const invalidationArn = this.formatArn({
      service: 'cloudfront',
      region: '', // CloudFront ARNs are global
      resource: 'distribution',
      resourceName: '*',
    });
    ingest.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateFinancialsPath',
        actions: ['cloudfront:CreateInvalidation'],
        resources: [invalidationArn],
      }),
    );
    ingest.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ReadDistributionIdParameter',
        actions: ['ssm:GetParameter'],
        resources: [
          this.formatArn({ service: 'ssm', resource: `parameter${distributionParameter}` }),
        ],
      }),
    );
    // The finding id must be a plain string (metadata keys cannot hold
    // tokens); cdk-nag flattens the partition ref to '<AWS::Partition>'.
    acknowledgeNagFinding(
      ingest,
      `AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:cloudfront::${config.account}:distribution/*]`,
      'The distribution id is runtime configuration (StaticSite publishes it downstream of Api; ' +
        'a deploy-time reference here would be a stack cycle). One distribution exists in the ' +
        'account, and CreateInvalidation only evicts cache entries.',
    );

    // The ingestion path owns every write, and only in ticker partitions
    // (spec §6: single-table access scoped by key-prefix conditions where
    // sensible). GetItem joins for the sweep's change detector, which reads
    // the stored filing marker before deciding whether to refetch. No
    // deletes exist anywhere: served data is only ever overwritten by a
    // newer ingest.
    ingest.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'WriteTickerPartitions',
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:BatchWriteItem',
        ],
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

    // --- ASX extraction (backend spec §5, Phase 2.5) -----------------------

    // The .AX route: ingestTicker delegates asynchronously, so this function
    // owns the ladder's time and the preprocessor's memory (the pinned §10
    // sizing) while the front door stays one function for both sources.
    const extract = new AppFunction(this, 'ExtractFiling', {
      entry: handlerEntry('extractFiling'),
      description:
        'ASX statutory-report extraction: MAP fetch, preprocess, cheap-first ladder, gates, DOC# cache (backend spec §5).',
      timeout: Duration.seconds(300),
      memorySize: 1536,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        CONTACT_PARAMETER: contactParameter,
        DISTRIBUTION_ID_PARAMETER: distributionParameter,
        // The budget kill switch: the Foundation flipper sets this flag to
        // 'false' at the kill threshold, and this function is the spender.
        EXTRACTION_FLAG_PARAMETER: `/app/${config.envName}/features/extraction`,
      },
    });
    this.extractFunction = extract.fn;
    ingest.fn.addEnvironment('EXTRACT_FUNCTION_NAME', extract.fn.functionName);
    extract.fn.grantInvoke(ingest.fn);
    acknowledgeNagFinding(
      ingest,
      `AwsSolutions-IAM5[Resource::<${this.getLogicalId(extract.fn.node.defaultChild as lambda.CfnFunction)}.Arn>:*]`,
      "grantInvoke's version-qualified suffix (':*') on exactly the one extraction function " +
        'the router delegates .AX tickers to; nothing broader is reachable.',
    );

    // JOB# joins for the upload-job walk (backend spec §6): the worker reads
    // the job it was fired for and writes its stages and terminal state.
    extract.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ExtractWriteTickerPartitions',
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:BatchWriteItem'],
        resources: [table.tableArn],
        conditions: {
          'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['TICKER#*', 'JOB#*'] },
        },
      }),
    );
    if (uploadsBucket !== undefined) {
      extract.fn.addEnvironment('UPLOADS_BUCKET', uploadsBucket.bucketName);
      // A literal ARN, not the bucket token: the bucket's physical name is
      // deterministic, and the literal keeps the cdk-nag finding id one
      // computable string across the test and synth gates.
      extract.fn.addToRolePolicy(
        new iam.PolicyStatement({
          sid: 'ReadUploadedFilings',
          actions: ['s3:GetObject'],
          resources: [uploadsObjectsArn(config)],
        }),
      );
      acknowledgeNagFinding(
        extract,
        `AwsSolutions-IAM5[Resource::${uploadsObjectsFindingArn(config)}]`,
        'Read access to the transient uploads keyspace only: every key is minted server-side ' +
          'under uploads/ with the caller prefix, and the bucket expires everything in seven days.',
      );
    }
    const extractionKeysArn = this.formatArn({
      service: 'ssm',
      resource: `parameter${extractionParameterPrefix(config.envName)}*`,
    });
    extract.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ReadProviderKeyParameters',
        actions: ['ssm:GetParameter'],
        resources: [
          extractionKeysArn,
          this.formatArn({ service: 'ssm', resource: `parameter${contactParameter}` }),
          this.formatArn({ service: 'ssm', resource: `parameter${distributionParameter}` }),
          this.formatArn({
            service: 'ssm',
            resource: `parameter/app/${config.envName}/features/extraction`,
          }),
        ],
      }),
    );
    acknowledgeNagFinding(
      extract,
      `AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:ssm:${this.region}:${config.account}:parameter${extractionParameterPrefix(config.envName)}*]`,
      'One SecureString per provider rung lives under this prefix, created out-of-band; the ' +
        'registry names each rung and the ladder skips absent parameters, so the wildcard is ' +
        'the set of provider keys and nothing else.',
    );
    extract.fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ExtractInvalidateFinancialsPath',
        actions: ['cloudfront:CreateInvalidation'],
        resources: [invalidationArn],
      }),
    );
    acknowledgeNagFinding(
      extract,
      `AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:cloudfront::${config.account}:distribution/*]`,
      'Same shape as the ingest function: the distribution id is runtime configuration and ' +
        'CreateInvalidation only evicts cache entries.',
    );
    acknowledgeNagFinding(
      extract,
      'AwsSolutions-IAM5[Resource::*]',
      'X-Ray daemon writes (PutTraceSegments, PutTelemetryRecords) support no resource-level ' +
        'scoping; tracing is deliberately on for the ingestion path only (main plan §6).',
    );

    // The router's delegation is asynchronous, so extraction failures never
    // reach the sweep DLQ; this alarm is their symptom surface.
    new cloudwatch.Alarm(this, 'ExtractFilingErrorsAlarm', {
      alarmDescription:
        'The ASX extraction function errored; check its log group and the quarantine queue.',
      metric: extract.fn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

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
        ASX_INDEX_KEY: ASX_DIRECTORY_OBJECT_KEY,
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
        resources: [
          this.indexBucket.arnForObjects(TICKER_INDEX_OBJECT_KEY),
          this.indexBucket.arnForObjects(ASX_DIRECTORY_OBJECT_KEY),
        ],
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
