/**
 * The DOC# extraction cache (backend spec §3): filings are immutable, so an
 * announcement document is extracted once and cached forever, provenance and
 * all. A quarantined extraction is cached too: it records that the document
 * was tried and what went wrong, and it is never served; re-running it after
 * a prompt or ladder fix is an explicit overwrite, not a default.
 */
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { extractionResultSchema } from '@plainsight/extraction-core';
import { z } from 'zod';

import { tickerPartition } from '../db/table.js';

export const documentSortKey = (documentId: string): string => `DOC#${documentId}`;

export const mapDocumentRecordSchema = z.object({
  ticker: z.string().min(1),
  /** The MAP idsId; immutable document identity. */
  documentId: z.string().min(1),
  headline: z.string().min(1),
  /** Lodgement date, YYYY-MM-DD. */
  documentDate: z.iso.date(),
  pdfPages: z.number().int().positive().optional(),
  status: z.enum(['extracted', 'quarantined']),
  /** Extraction provenance (main plan §6): which model read this filing. */
  promptVersion: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  extractedAt: z.iso.datetime(),
  result: extractionResultSchema.optional(),
  /** Why the document quarantined, in words, for the review queue. */
  failure: z.string().optional()
});
export type MapDocumentRecord = z.infer<typeof mapDocumentRecordSchema>;

export interface DocumentCacheStore {
  getDocument(ticker: string, documentId: string): Promise<MapDocumentRecord | undefined>;
  putDocument(record: MapDocumentRecord, options?: { overwrite?: boolean }): Promise<void>;
}

export class DocumentCache implements DocumentCacheStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async getDocument(ticker: string, documentId: string): Promise<MapDocumentRecord | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: tickerPartition(ticker), SK: documentSortKey(documentId) }
      })
    );
    if (result.Item === undefined) return undefined;
    // Parse-on-read, the table module's discipline: a stored row that fails
    // the schema is treated as absent rather than half-served.
    const parsed = mapDocumentRecordSchema.safeParse(result.Item);
    return parsed.success ? parsed.data : undefined;
  }

  async putDocument(
    record: MapDocumentRecord,
    options: { overwrite?: boolean } = {}
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: tickerPartition(record.ticker),
          SK: documentSortKey(record.documentId),
          ...mapDocumentRecordSchema.parse(record)
        },
        ...(options.overwrite === true
          ? {}
          : { ConditionExpression: 'attribute_not_exists(SK)' })
      })
    );
  }
}
