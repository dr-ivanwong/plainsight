import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { acknowledgeNagFinding } from '../nag';

/**
 * Capacity arithmetic (spec §8): the always-free tier is 25 RCU and 25 WCU
 * account-wide, counted across tables AND their global secondary indexes.
 * With the sync-feed index (Phase 3, backend spec §3) the allocation is the
 * planned carve-out, never an addition: table 15/15, watched tickers 5/5,
 * sync feed 5/5, summing to exactly the free ceiling so the table costs $0
 * forever at this scale. The invariant test pins the sum.
 */
export const TABLE_READ_CAPACITY = 15;
export const TABLE_WRITE_CAPACITY = 15;
export const WATCH_INDEX_CAPACITY = 5;
export const SYNC_INDEX_CAPACITY = 5;

export const WATCHED_TICKERS_INDEX = 'watchedTickers';
/** Attribute names here must match the api workspace's sync store, which writes them. */
export const SYNC_FEED_INDEX = 'syncFeed';

/**
 * The uploads bucket's physical name is deterministic (account-suffixed for
 * global uniqueness, environment-prefixed so a rehearsal copy never
 * collides), so consuming stacks can write literal policy ARNs and literal
 * cdk-nag acknowledgements instead of cross-stack tokens whose flattening
 * differs between the test and synth gates.
 */
export const uploadsBucketName = (config: EnvConfig): string =>
  `plainsight-${config.envName}-uploads-${config.account}`;

/** The uploads keyspace as a policy resource; PARTITION stays a token. */
export const uploadsObjectsArn = (config: EnvConfig): string =>
  `arn:${Aws.PARTITION}:s3:::${uploadsBucketName(config)}/uploads/*`;

/** The same ARN as cdk-nag flattens it, for acknowledgement ids. */
export const uploadsObjectsFindingArn = (config: EnvConfig): string =>
  `arn:<AWS::Partition>:s3:::${uploadsBucketName(config)}/uploads/*`;

/** The pairs artefact keyspace (integration plan §4): durable, outside the
 * uploads/ seven-day lifecycle; the engine publishes, the app reads. */
export const pairsObjectsArn = (config: EnvConfig): string =>
  `arn:${Aws.PARTITION}:s3:::${uploadsBucketName(config)}/pairs/*`;

/** The same ARN as cdk-nag flattens it, for acknowledgement ids. */
export const pairsObjectsFindingArn = (config: EnvConfig): string =>
  `arn:<AWS::Partition>:s3:::${uploadsBucketName(config)}/pairs/*`;

export interface DataStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * Data (spec §3, Phase 2): the one DynamoDB table, single-table design per
 * backend spec §3: ticker partitions holding a profile item and per-year
 * statement items now; user partitions, job state, and idempotency records
 * join in Phase 3 without schema changes. Stateful, so it lives alone: an API
 * iteration can never touch the table holding data (spec §1.1), and its
 * deploys route through the stateful-stack environment gate (spec §7).
 */
export class DataStack extends Stack {
  readonly table: dynamodb.Table;
  /** Present once the Phase 3 authenticated surface is on (spec §3 Data row). */
  readonly uploadsBucket: s3.Bucket | undefined;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: TABLE_READ_CAPACITY,
      writeCapacity: TABLE_WRITE_CAPACITY,
      // One TTL attribute serves every expiring item type the key design pins
      // (backend spec §3): idempotency replays, extraction job state, sync
      // tombstones. Fixed now because it is a table-level setting; Phase 2
      // items simply never set it.
      timeToLiveAttribute: 'expiresAt',
      // Point-in-time recovery rides config.protectData from day one. The cdk
      // spec staggers PITR to Phase 3 as a cost note, but on a table measured
      // in megabytes it costs cents, and the spec §6 invariant pins the prod
      // posture as PITR plus deletion protection; a rehearsal copy stays
      // disposable.
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: config.protectData,
      },
      deletionProtection: config.protectData,
      removalPolicy: config.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      // Encryption stays on the DynamoDB-owned key: at-rest encryption with
      // zero key cost, per the spec §8 not-list on customer-managed keys
      // (ADR 0004).
    });

    if (!config.protectData) {
      // The rehearsal copy is deployed for a day and destroyed (spec §2);
      // backups on a disposable table would protect nothing. Prod keeps PITR
      // through protectData, and the spec §6 invariant pins that posture.
      acknowledgeNagFinding(
        this.table,
        'AwsSolutions-DDB3',
        'Disposable rehearsal copy: torn down within a day, holds no data anyone would restore; prod pins PITR via protectData.'
      );
    }

    // The sparse watched-tickers index (backend spec §3): a profile item
    // gains watchPartition='WATCH' alongside its ticker on first successful
    // ingest, which is the definition of a watched ticker. Only watched
    // profiles ever enter the index, so the weekly sweep is a single Query
    // over one partition, ordered by ticker. Profiles are small and few, so
    // projecting everything saves the sweep a second read per ticker for
    // storage measured in kilobytes.
    this.table.addGlobalSecondaryIndex({
      indexName: WATCHED_TICKERS_INDEX,
      partitionKey: { name: 'watchPartition', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ticker', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      readCapacity: WATCH_INDEX_CAPACITY,
      writeCapacity: WATCH_INDEX_CAPACITY,
    });

    // The sync feed (backend spec §3): sparse over the record envelopes,
    // whose sync attributes carry the user partition and the zero-padded
    // sequence, so a pull is one Query for everything above a checkpoint.
    // Projecting everything: the pull serves whole envelopes, and user
    // records are small and few for a single-user product.
    this.table.addGlobalSecondaryIndex({
      indexName: SYNC_FEED_INDEX,
      partitionKey: { name: 'syncUser', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'syncSeq', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      readCapacity: SYNC_INDEX_CAPACITY,
      writeCapacity: SYNC_INDEX_CAPACITY,
    });

    // The uploads bucket (spec §3 Data row, Phase 3): filings on their way
    // to the extraction worker, presign-PUT from the app origin, everything
    // expiring in seven days so an abandoned upload costs nothing. Arrives
    // with the Phase 3 authenticated surface, which this repo gates behind
    // features.sync.
    if (config.features.sync) {
      const corsOrigins = [config.siteOrigin, 'http://localhost:5173'].filter(
        (origin): origin is string => origin !== null,
      );
      this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
        bucketName: uploadsBucketName(config),
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
        lifecycleRules: [
          {
            // The seven-day expiry governs the transient filing uploads
            // only; the pairs/ artefact keyspace (integration plan §4) is
            // durable, so the rule is prefix-scoped rather than
            // bucket-wide (scoped 2026-07-22 with the pairs transport).
            prefix: 'uploads/',
            expiration: Duration.days(7),
          },
          {
            noncurrentVersionExpiration: Duration.days(1),
            abortIncompleteMultipartUploadAfter: Duration.days(1),
          },
        ],
        cors: [
          {
            allowedMethods: [s3.HttpMethods.PUT],
            allowedOrigins: corsOrigins,
            allowedHeaders: ['content-type'],
          },
        ],
        removalPolicy: config.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });
      acknowledgeNagFinding(
        this.uploadsBucket,
        'AwsSolutions-S1',
        'No server access logging: spec §8 not-list (ADR 0004). The bucket holds transient ' +
          'uploads for at most seven days, PUT only by the owner through presigned URLs; an ' +
          'access-log bucket would outlive everything it watched.',
      );
      new CfnOutput(this, 'UploadsBucketName', {
        value: this.uploadsBucket.bucketName,
        description: 'Transient filing uploads (backend spec §6); seven-day lifecycle.',
      });
    }

    new CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'The single Plainsight table (backend spec §3 key design).',
    });
    new CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Table ARN, for the runbook and for wiring checks.',
    });
  }
}
