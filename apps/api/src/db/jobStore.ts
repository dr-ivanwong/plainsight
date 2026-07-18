/**
 * Extraction job storage (backend spec §3, §6): the JOB# state item with its
 * 30-day TTL, the per-user monthly quota on server-key jobs, and the shared
 * idempotency replays. The job record is the wire job plus the two internal
 * facts (owner, object) the API strips before serving.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import type { ExtractionJob } from '@plainsight/api-contract';
import { getStoredResponse, storeResponse } from './idempotency.js';
import { userPartition } from './syncStore.js';

export const jobPartition = (jobId: string): string => `JOB#${jobId}`;
export const JOB_SORT_KEY = 'STATE';
export const quotaSortKey = (month: string): string => `QUOTA#${month}`;

export const JOB_TTL_DAYS = 30;
export const MONTHLY_JOB_QUOTA = 10;

/** The wire job plus the internals the API never serves. */
export interface StoredJob extends ExtractionJob {
  userId: string;
  objectKey: string;
}

export type JobPatch = Partial<
  Pick<StoredJob, 'state' | 'rung' | 'attempts' | 'review' | 'failure'>
>;

export interface JobStore {
  createJob(job: StoredJob, expiresAt: number): Promise<void>;
  getJob(jobId: string): Promise<StoredJob | undefined>;
  patchJob(jobId: string, patch: JobPatch): Promise<void>;
  /** True when this month's count was below the limit and is now consumed. */
  tryConsumeQuota(userId: string, month: string, limit: number): Promise<boolean>;
  getStoredResponse(idempotencyKey: string, userId: string): Promise<string | undefined>;
  storeResponse(
    idempotencyKey: string,
    userId: string,
    body: string,
    expiresAt: number
  ): Promise<void>;
}

export class TableJobStore implements JobStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  static fromEnv(): TableJobStore {
    const tableName = process.env['TABLE_NAME'];
    if (!tableName) throw new Error('TABLE_NAME is not set');
    return new TableJobStore(
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true }
      }),
      tableName
    );
  }

  async createJob(job: StoredJob, expiresAt: number): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: jobPartition(job.jobId), SK: JOB_SORT_KEY, expiresAt, ...job },
        ConditionExpression: 'attribute_not_exists(PK)'
      })
    );
  }

  async getJob(jobId: string): Promise<StoredJob | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: jobPartition(jobId), SK: JOB_SORT_KEY }
      })
    );
    if (result.Item === undefined) return undefined;
    const { PK, SK, expiresAt, ...job } = result.Item;
    void PK;
    void SK;
    void expiresAt;
    return job as StoredJob;
  }

  async patchJob(jobId: string, patch: JobPatch): Promise<void> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return;
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: jobPartition(jobId), SK: JOB_SORT_KEY },
        UpdateExpression: `SET ${entries.map(([key]) => `#${key} = :${key}`).join(', ')}`,
        ExpressionAttributeNames: Object.fromEntries(entries.map(([key]) => [`#${key}`, key])),
        ExpressionAttributeValues: Object.fromEntries(
          entries.map(([key, value]) => [`:${key}`, value])
        )
      })
    );
  }

  async tryConsumeQuota(userId: string, month: string, limit: number): Promise<boolean> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: userPartition(userId), SK: quotaSortKey(month) },
          UpdateExpression: 'ADD jobs :one',
          ConditionExpression: 'attribute_not_exists(jobs) OR jobs < :limit',
          ExpressionAttributeValues: { ':one': 1, ':limit': limit }
        })
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async getStoredResponse(idempotencyKey: string, userId: string): Promise<string | undefined> {
    return getStoredResponse(this.client, this.tableName, idempotencyKey, userId);
  }

  async storeResponse(
    idempotencyKey: string,
    userId: string,
    body: string,
    expiresAt: number
  ): Promise<void> {
    return storeResponse(this.client, this.tableName, idempotencyKey, userId, body, expiresAt);
  }
}
