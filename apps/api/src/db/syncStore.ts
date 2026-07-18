/**
 * The user-partition storage boundary (backend spec §3 key design, §4
 * protocol): sync record envelopes with their feed positions, the per-user
 * sequence item that also carries the tombstone bookkeeping, per-device
 * checkpoints, and the idempotency replay records. Everything here lives
 * under USER# and IDEMP# partitions; the ticker partitions belong to
 * ingestion and the read path.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { syncServerRecordSchema, type SyncServerRecord } from '@plainsight/api-contract';

export const userPartition = (userId: string): string => `USER#${userId}`;
export const recordSortKey = (recordType: string, recordId: string): string =>
  `REC#${recordType}#${recordId}`;
export const SEQ_SORT_KEY = 'SEQ';
export const checkpointSortKey = (deviceId: string): string => `CKPT#${deviceId}`;
export const idempotencyPartition = (key: string): string => `IDEMP#${key}`;
export const IDEMPOTENCY_SORT_KEY = 'RESP';
export const thesisVersionSortKey = (recordId: string, lamport: number): string =>
  `THESISV#${recordId}#${lamport}`;

/** The sync-feed index attributes (Data stack GSI, backend spec §3). */
export const SYNC_FEED_INDEX = 'syncFeed';
const SEQ_PAD_WIDTH = 12;
export const feedSortValue = (seq: number): string =>
  `SEQ#${String(seq).padStart(SEQ_PAD_WIDTH, '0')}`;

/** A tombstone's purge bookkeeping entry on the sequence item (backend spec §4). */
export interface TombstoneMark {
  seq: number;
  /** Epoch seconds; matches the record's TTL attribute. */
  expiresAt: number;
}

export interface FeedState {
  /** Highest assigned sequence number; zero before the first accepted push. */
  seq: number;
  /** Sequence of the newest tombstone whose TTL has already purged it. */
  purgeWatermark: number;
  /** Tombstones not yet known to be purged, in seq order. */
  marks: TombstoneMark[];
}

/** What the sync protocol needs from storage; the core takes this, tests fake it. */
export interface SyncStore {
  getRecord(
    userId: string,
    recordType: string,
    recordId: string
  ): Promise<SyncServerRecord | undefined>;
  /** Transactionally assigns the next per-user sequence number (backend spec §3). */
  nextSeq(userId: string): Promise<number>;
  /**
   * Writes the record iff (lamport, deviceId) still exceeds the stored pair,
   * the race guard behind the read-compare in the core. Returns false when a
   * concurrent write got there first.
   */
  putRecordIfNewer(
    userId: string,
    record: SyncServerRecord,
    expiresAt?: number
  ): Promise<boolean>;
  /** Append-only, exempt from last-write-wins; a key collision is a no-op. */
  appendThesisVersion(
    userId: string,
    recordId: string,
    lamport: number,
    payload: unknown,
    recordedAt: string
  ): Promise<void>;
  markTombstone(userId: string, mark: TombstoneMark): Promise<void>;
  getFeedState(userId: string): Promise<FeedState>;
  advanceWatermark(userId: string, watermark: number, marks: TombstoneMark[]): Promise<void>;
  queryFeed(
    userId: string,
    afterSeq: number,
    limit: number
  ): Promise<{ records: SyncServerRecord[]; hasMore: boolean }>;
  putCheckpoint(userId: string, deviceId: string, checkpoint: number): Promise<void>;
  /** The stored response body for an idempotent replay, if one exists for this user. */
  getStoredResponse(idempotencyKey: string, userId: string): Promise<string | undefined>;
  storeResponse(
    idempotencyKey: string,
    userId: string,
    body: string,
    expiresAt: number
  ): Promise<void>;
}

export class TableSyncStore implements SyncStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  static fromEnv(): TableSyncStore {
    const tableName = process.env['TABLE_NAME'];
    if (!tableName) throw new Error('TABLE_NAME is not set');
    return new TableSyncStore(
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true }
      }),
      tableName
    );
  }

  async getRecord(
    userId: string,
    recordType: string,
    recordId: string
  ): Promise<SyncServerRecord | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPartition(userId), SK: recordSortKey(recordType, recordId) }
      })
    );
    if (result.Item === undefined) return undefined;
    // Parsing against the wire schema strips the storage attributes (keys,
    // feed attributes, TTL), the same boundary discipline as the read path.
    return syncServerRecordSchema.parse(result.Item);
  }

  async nextSeq(userId: string): Promise<number> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPartition(userId), SK: SEQ_SORT_KEY },
        UpdateExpression: 'ADD seq :one',
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'UPDATED_NEW'
      })
    );
    return Number(result.Attributes?.['seq']);
  }

  async putRecordIfNewer(
    userId: string,
    record: SyncServerRecord,
    expiresAt?: number
  ): Promise<boolean> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: userPartition(userId),
            SK: recordSortKey(record.recordType, record.recordId),
            syncUser: userPartition(userId),
            syncSeq: feedSortValue(record.seq),
            ...(expiresAt === undefined ? {} : { expiresAt }),
            ...record
          },
          ConditionExpression:
            'attribute_not_exists(PK) OR lamport < :lamport OR (lamport = :lamport AND deviceId < :device)',
          ExpressionAttributeValues: {
            ':lamport': record.lamport,
            ':device': record.deviceId
          }
        })
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async appendThesisVersion(
    userId: string,
    recordId: string,
    lamport: number,
    payload: unknown,
    recordedAt: string
  ): Promise<void> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: userPartition(userId),
            SK: thesisVersionSortKey(recordId, lamport),
            payload,
            recordedAt
          },
          ConditionExpression: 'attribute_not_exists(PK)'
        })
      );
    } catch (error) {
      // Append-only means first write wins and a replay changes nothing.
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return;
      throw error;
    }
  }

  async markTombstone(userId: string, mark: TombstoneMark): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPartition(userId), SK: SEQ_SORT_KEY },
        UpdateExpression:
          'SET tombstoneMarks = list_append(if_not_exists(tombstoneMarks, :empty), :mark)',
        ExpressionAttributeValues: { ':empty': [], ':mark': [mark] }
      })
    );
  }

  async getFeedState(userId: string): Promise<FeedState> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPartition(userId), SK: SEQ_SORT_KEY }
      })
    );
    const item = result.Item ?? {};
    return {
      seq: typeof item['seq'] === 'number' ? item['seq'] : 0,
      purgeWatermark:
        typeof item['tombstonePurgeWatermark'] === 'number' ? item['tombstonePurgeWatermark'] : 0,
      marks: Array.isArray(item['tombstoneMarks']) ? (item['tombstoneMarks'] as TombstoneMark[]) : []
    };
  }

  async advanceWatermark(
    userId: string,
    watermark: number,
    marks: TombstoneMark[]
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPartition(userId), SK: SEQ_SORT_KEY },
        UpdateExpression: 'SET tombstonePurgeWatermark = :watermark, tombstoneMarks = :marks',
        ExpressionAttributeValues: { ':watermark': watermark, ':marks': marks }
      })
    );
  }

  async queryFeed(
    userId: string,
    afterSeq: number,
    limit: number
  ): Promise<{ records: SyncServerRecord[]; hasMore: boolean }> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: SYNC_FEED_INDEX,
        KeyConditionExpression: 'syncUser = :user AND syncSeq > :after',
        ExpressionAttributeValues: {
          ':user': userPartition(userId),
          ':after': feedSortValue(afterSeq)
        },
        Limit: limit
      })
    );
    return {
      records: (result.Items ?? []).map((item) => syncServerRecordSchema.parse(item)),
      hasMore: result.LastEvaluatedKey !== undefined
    };
  }

  async putCheckpoint(userId: string, deviceId: string, checkpoint: number): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: userPartition(userId),
          SK: checkpointSortKey(deviceId),
          checkpoint
        }
      })
    );
  }

  async getStoredResponse(idempotencyKey: string, userId: string): Promise<string | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: idempotencyPartition(idempotencyKey), SK: IDEMPOTENCY_SORT_KEY }
      })
    );
    const item = result.Item;
    // A key is scoped to the user who minted it; a stranger's key computes fresh.
    if (item === undefined || item['userId'] !== userId) return undefined;
    return typeof item['body'] === 'string' ? item['body'] : undefined;
  }

  async storeResponse(
    idempotencyKey: string,
    userId: string,
    body: string,
    expiresAt: number
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: idempotencyPartition(idempotencyKey),
          SK: IDEMPOTENCY_SORT_KEY,
          userId,
          body,
          expiresAt
        }
      })
    );
  }
}
