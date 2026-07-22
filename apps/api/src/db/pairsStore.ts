/**
 * The pairs artefact store (integration plan §4 transport): scan reports
 * land as durable objects under pairs/ in the uploads bucket (outside the
 * uploads/ seven-day lifecycle), with one run row per run date under the
 * PAIRS# partition. Run dates are ISO, so the sort key orders
 * chronologically and the latest run is the first row of a descending
 * query. Writes arrive only from the engine's authenticated publish; the
 * app renders and never writes sleeve data.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { pairsArtefactRunSchema, type PairScanReport, type PairsArtefactRun } from '@plainsight/api-contract';

export const PAIRS_PARTITION = 'PAIRS#pair-scan';
export const PAIRS_RUN_SORT_PREFIX = 'RUN#';
export const PAIRS_OBJECT_PREFIX = 'pairs/pair-scan/';
export const PAIRS_HISTORY_LIMIT = 25;

export interface PairsArtefactStore {
  putRun(report: PairScanReport, receivedAt: string): Promise<PairsArtefactRun>;
  listRuns(): Promise<PairsArtefactRun[]>;
  getReport(runDate: string): Promise<unknown>;
}

export class TablePairsStore implements PairsArtefactStore {
  constructor(
    private readonly documents: DynamoDBDocumentClient,
    private readonly s3: S3Client,
    private readonly tableName: string,
    private readonly bucketName: string
  ) {}

  static fromEnv(): TablePairsStore {
    const tableName = process.env['TABLE_NAME'];
    if (tableName === undefined || tableName === '') {
      throw new Error('TABLE_NAME is not configured');
    }
    const bucketName = process.env['UPLOADS_BUCKET'];
    if (bucketName === undefined || bucketName === '') {
      throw new Error('UPLOADS_BUCKET is not configured');
    }
    const documents = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true }
    });
    return new TablePairsStore(documents, new S3Client({}), tableName, bucketName);
  }

  async putRun(report: PairScanReport, receivedAt: string): Promise<PairsArtefactRun> {
    const body = JSON.stringify(report);
    const objectKey = `${PAIRS_OBJECT_PREFIX}${report.runDate}.json`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: body,
        ContentType: 'application/json'
      })
    );
    const row: PairsArtefactRun = {
      runDate: report.runDate,
      engineVersion: report.engineVersion,
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      receivedAt,
      sizeBytes: Buffer.byteLength(body)
    };
    await this.documents.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: PAIRS_PARTITION,
          SK: `${PAIRS_RUN_SORT_PREFIX}${report.runDate}`,
          objectKey,
          ...row
        }
      })
    );
    return row;
  }

  async listRuns(): Promise<PairsArtefactRun[]> {
    const result = await this.documents.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :partition AND begins_with(SK, :run)',
        ExpressionAttributeValues: {
          ':partition': PAIRS_PARTITION,
          ':run': PAIRS_RUN_SORT_PREFIX
        },
        ScanIndexForward: false,
        Limit: PAIRS_HISTORY_LIMIT
      })
    );
    return (result.Items ?? []).map((item) => pairsArtefactRunSchema.parse(item));
  }

  async getReport(runDate: string): Promise<unknown> {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: `${PAIRS_OBJECT_PREFIX}${runDate}.json`
      })
    );
    const body = await result.Body?.transformToString();
    if (body === undefined) {
      throw new Error(`stored artefact for ${runDate} has no body`);
    }
    return JSON.parse(body) as unknown;
  }
}
