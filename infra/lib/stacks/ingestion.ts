import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { edgarContactParameterName } from '../constants';
import { AppFunction, handlerEntry } from '../constructs/app-function';
import { acknowledgeNagFinding } from '../nag';

export interface IngestionStackProps extends StackProps {
  config: EnvConfig;
  table: dynamodb.ITable;
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
    const { config, table } = props;

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

    new CfnOutput(this, 'IngestFunctionName', {
      value: ingest.fn.functionName,
      description: 'The on-demand ingest function; the financials route fires it on cold tickers.',
    });
  }
}
