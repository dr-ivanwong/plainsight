/**
 * The single-table boundary (backend spec §3 key design): key builders shared
 * by every reader and writer, and the read store the API handlers consume.
 * Stored statement items are exactly the wire rows plus their keys, so a read
 * is parse-and-serve: the contract schema strips the keys and re-checks the
 * row, and a stored row that fails the contract can never reach a client.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
    // them, so the API serves the product shape and nothing else.
    return companyProfileSchema.parse(result.Item);
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
