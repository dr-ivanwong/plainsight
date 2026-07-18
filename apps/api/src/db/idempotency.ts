/**
 * The idempotency replay records (backend spec §2: mandatory on sync push and
 * extraction starts; 24-hour window; replay returns the originally stored
 * response). One shape, shared by every handler that takes an
 * Idempotency-Key; the key is scoped to the user who minted it.
 */
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const idempotencyPartition = (key: string): string => `IDEMP#${key}`;
export const IDEMPOTENCY_SORT_KEY = 'RESP';

export async function getStoredResponse(
  client: DynamoDBDocumentClient,
  tableName: string,
  idempotencyKey: string,
  userId: string
): Promise<string | undefined> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: idempotencyPartition(idempotencyKey), SK: IDEMPOTENCY_SORT_KEY }
    })
  );
  const item = result.Item;
  if (item === undefined || item['userId'] !== userId) return undefined;
  return typeof item['body'] === 'string' ? item['body'] : undefined;
}

export async function storeResponse(
  client: DynamoDBDocumentClient,
  tableName: string,
  idempotencyKey: string,
  userId: string,
  body: string,
  expiresAt: number
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: tableName,
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
