import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';

/**
 * Capacity arithmetic (spec §8): the always-free tier is 25 RCU and 25 WCU
 * account-wide, counted across tables AND their global secondary indexes. The
 * table takes 20/20 and the watched-tickers index 5/5, so the allocation sums
 * to exactly the free ceiling and the table costs $0 forever at this scale.
 * When the sync-feed index arrives (Phase 3, backend spec §3), it is carved
 * out of the table's share (15/15 + 5/5 + 5/5), never added on top; the
 * invariant test pins the sum.
 */
export const TABLE_READ_CAPACITY = 20;
export const TABLE_WRITE_CAPACITY = 20;
export const WATCH_INDEX_CAPACITY = 5;

export const WATCHED_TICKERS_INDEX = 'watchedTickers';

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
