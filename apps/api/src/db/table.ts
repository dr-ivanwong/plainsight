/**
 * The single-table boundary (backend spec §3 key design): key builders shared
 * by every reader and writer, and the read store the API handlers consume.
 * Stored statement items are exactly the wire rows plus their keys, so a read
 * is parse-and-serve: the contract schema strips the keys and re-checks the
 * row, and a stored row that fails the contract can never reach a client.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import {
  companyProfileSchema,
  financialsStatementSchema,
  type CompanyProfile,
  type FinancialsStatement
} from '@plainsight/api-contract';
import { fyYear, type FyLabel, type StatementKind } from '@plainsight/calc-engine';

export const tickerPartition = (ticker: string): string => `TICKER#${ticker}`;
export const PROFILE_SORT_KEY = 'PROFILE';
export const STATEMENT_SORT_PREFIX = 'FY#';
export const statementSortKey = (fy: FyLabel, statement: StatementKind): string =>
  `${STATEMENT_SORT_PREFIX}${fyYear(fy)}#STMT#${statement}`;
export const quarantineSortKey = (documentId: string): string => `QUAR#${documentId}`;

/** The sparse watched-tickers index attributes (Data stack): set on first successful ingest. */
export const WATCH_PARTITION_VALUE = 'WATCH';

/** What the API read path needs from storage; handlers take this, tests fake it. */
export interface FinancialsReadStore {
  getProfile(ticker: string): Promise<CompanyProfile | undefined>;
  listStatementRows(ticker: string): Promise<FinancialsStatement[]>;
}

export class TableReadStore implements FinancialsReadStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  /** The Lambda entry point wiring: table name from the environment, one client per container. */
  static fromEnv(): TableReadStore {
    const tableName = process.env['TABLE_NAME'];
    if (!tableName) throw new Error('TABLE_NAME is not set');
    return new TableReadStore(
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true }
      }),
      tableName
    );
  }

  async getProfile(ticker: string): Promise<CompanyProfile | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: tickerPartition(ticker), SK: PROFILE_SORT_KEY }
      })
    );
    if (result.Item === undefined) return undefined;
    // The profile item carries operational attributes too (watch state, sweep
    // bookkeeping, backend spec §3); parsing against the wire schema strips
    // them, so the API serves the product shape and nothing else. An item
    // that does not parse is not yet a profile: the ingest lock writes a stub
    // item before the real profile lands, and readers must keep answering
    // "cold" until completion.
    const parsed = companyProfileSchema.safeParse(result.Item);
    return parsed.success ? parsed.data : undefined;
  }

  async listStatementRows(ticker: string): Promise<FinancialsStatement[]> {
    const rows: FinancialsStatement[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :fy)',
          ExpressionAttributeValues: {
            ':pk': tickerPartition(ticker),
            ':fy': STATEMENT_SORT_PREFIX
          },
          ...(startKey === undefined ? {} : { ExclusiveStartKey: startKey })
        })
      );
      for (const item of result.Items ?? []) {
        rows.push(financialsStatementSchema.parse(item));
      }
      startKey = result.LastEvaluatedKey;
    } while (startKey !== undefined);
    return rows;
  }
}

/** A quarantined year: gate-failed rows, held for review, never served (backend spec §5). */
export interface QuarantineEntry {
  documentId: string;
  fy: FyLabel;
  reasons: string[];
  rows: FinancialsStatement[];
}

/** The completed-profile write, performed once the rows are in. */
export interface ProfileWrite {
  ticker: string;
  name: string;
  cik: number;
  exchange?: string | undefined;
  currency: string;
  /** Primary accession of the newest served year; the sweep's change detector. */
  lastFilingSeen: string;
  latestFyEndDate: string;
}

/** What the ingest path needs from storage; the core takes this, tests fake it. */
export interface IngestStore {
  /**
   * The per-ticker ingest lock (backend spec §5): a conditional attribute on
   * the profile item with a lease. Returns false when another ingest holds an
   * unexpired lease. The stub item this creates is not a profile: readers
   * treat a profile as existing only once it parses against the wire schema.
   */
  acquireIngestLock(ticker: string, nowIso: string, untilIso: string): Promise<boolean>;
  releaseIngestLock(ticker: string, untilIso: string): Promise<void>;
  putStatementRows(ticker: string, rows: FinancialsStatement[]): Promise<void>;
  putQuarantine(ticker: string, entry: QuarantineEntry, nowIso: string): Promise<void>;
  completeProfile(profile: ProfileWrite, nowIso: string): Promise<void>;
}

export class TableStore extends TableReadStore implements IngestStore {
  constructor(
    private readonly writeClient: DynamoDBDocumentClient,
    private readonly writeTableName: string
  ) {
    super(writeClient, writeTableName);
  }

  static override fromEnv(): TableStore {
    const tableName = process.env['TABLE_NAME'];
    if (!tableName) throw new Error('TABLE_NAME is not set');
    return new TableStore(
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true }
      }),
      tableName
    );
  }

  async acquireIngestLock(ticker: string, nowIso: string, untilIso: string): Promise<boolean> {
    try {
      await this.writeClient.send(
        new UpdateCommand({
          TableName: this.writeTableName,
          Key: { PK: tickerPartition(ticker), SK: PROFILE_SORT_KEY },
          UpdateExpression: 'SET ingestLockUntil = :until',
          ConditionExpression: 'attribute_not_exists(ingestLockUntil) OR ingestLockUntil < :now',
          ExpressionAttributeValues: { ':until': untilIso, ':now': nowIso }
        })
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async releaseIngestLock(ticker: string, untilIso: string): Promise<void> {
    try {
      await this.writeClient.send(
        new UpdateCommand({
          TableName: this.writeTableName,
          Key: { PK: tickerPartition(ticker), SK: PROFILE_SORT_KEY },
          UpdateExpression: 'REMOVE ingestLockUntil',
          // Only the holder releases; an expired lease is simply overwritten
          // by the next acquisition.
          ConditionExpression: 'ingestLockUntil = :until',
          ExpressionAttributeValues: { ':until': untilIso }
        })
      );
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return;
      throw error;
    }
  }

  async putStatementRows(ticker: string, rows: FinancialsStatement[]): Promise<void> {
    // BatchWrite in the 25-item pages DynamoDB allows, retrying unprocessed
    // items with backoff; the whole write is idempotent (puts by full key).
    const items = rows.map((row) => ({
      PutRequest: {
        Item: { PK: tickerPartition(ticker), SK: statementSortKey(row.fy, row.statement), ...row }
      }
    }));
    for (let start = 0; start < items.length; start += 25) {
      let batch = items.slice(start, start + 25);
      for (let attempt = 1; batch.length > 0; attempt += 1) {
        const result = await this.writeClient.send(
          new BatchWriteCommand({ RequestItems: { [this.writeTableName]: batch } })
        );
        const unprocessed = result.UnprocessedItems?.[this.writeTableName] ?? [];
        if (unprocessed.length === 0) break;
        if (attempt >= 5) throw new Error(`${ticker}: ${unprocessed.length} statement rows unprocessed after ${attempt} attempts`);
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
        batch = unprocessed as typeof batch;
      }
    }
  }

  async putQuarantine(ticker: string, entry: QuarantineEntry, nowIso: string): Promise<void> {
    await this.writeClient.send(
      new PutCommand({
        TableName: this.writeTableName,
        Item: {
          PK: tickerPartition(ticker),
          SK: quarantineSortKey(entry.documentId),
          fy: entry.fy,
          reasons: entry.reasons,
          rows: entry.rows,
          quarantinedAt: nowIso
        }
      })
    );
  }

  async completeProfile(profile: ProfileWrite, nowIso: string): Promise<void> {
    await this.writeClient.send(
      new UpdateCommand({
        TableName: this.writeTableName,
        Key: { PK: tickerPartition(profile.ticker), SK: PROFILE_SORT_KEY },
        // watchedSince is set once, on first successful ingest: that is the
        // definition of a watched ticker (backend spec §3), and with the
        // watchPartition attribute it enters the sparse watch index.
        UpdateExpression:
          'SET ticker = :ticker, #n = :name, cik = :cik, currency = :currency, ' +
          'lastFilingSeen = :lastFilingSeen, latestFyEndDate = :latestFyEndDate, ' +
          'watchedSince = if_not_exists(watchedSince, :now), watchPartition = :watch' +
          (profile.exchange === undefined ? '' : ', exchange = :exchange') +
          ' REMOVE ingestLockUntil',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':ticker': profile.ticker,
          ':name': profile.name,
          ':cik': profile.cik,
          ':currency': profile.currency,
          ':lastFilingSeen': profile.lastFilingSeen,
          ':latestFyEndDate': profile.latestFyEndDate,
          ':now': nowIso,
          ':watch': WATCH_PARTITION_VALUE,
          ...(profile.exchange === undefined ? {} : { ':exchange': profile.exchange })
        }
      })
    );
  }
}
