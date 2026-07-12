/**
 * GET /v1/search?q=…&pageToken=… (backend spec §2, §8): the in-memory ticker
 * search. No search infrastructure, single-digit-millisecond queries once the
 * index is warm. Phase 2 serves the EDGAR index; the ASX list joins in Phase
 * 2.5 when those tickers can actually ingest.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { errorEnvelope, searchResponseSchema } from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { getCachedParameter } from '../aws/ssmParam.js';
import { EdgarClient } from '../edgar/client.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { IndexLoader, TICKER_INDEX_KEY, type IndexObjectStore } from '../search/load.js';
import { decodePageToken, searchListings } from '../search/search.js';

const MAX_QUERY_LENGTH = 40;

export function createSearchHandler(loader: IndexLoader) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const q = event.queryStringParameters?.['q']?.trim() ?? '';
      if (q.length === 0 || q.length > MAX_QUERY_LENGTH) {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'q must be 1 to 40 characters.', requestId)
        );
      }
      let offset = 0;
      const token = event.queryStringParameters?.['pageToken'];
      if (token !== undefined) {
        const decoded = decodePageToken(token, q);
        if (decoded === undefined) {
          return jsonResponse(
            400,
            errorEnvelope('invalid_request', 'pageToken is not valid for this query.', requestId)
          );
        }
        offset = decoded;
      }

      const listings = await loader.load();
      const body = searchResponseSchema.parse(searchListings(listings, q, offset));
      logOutcome({ requestId, route: 'searchTickers', outcome: 'ok' });
      return jsonResponse(200, body);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'searchTickers',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong searching tickers.', requestId)
      );
    }
  };
}

function buildObjectStore(): IndexObjectStore | undefined {
  const bucket = process.env['INDEX_BUCKET'];
  if (!bucket) return undefined;
  // The stack sets the key alongside the bucket so the grant, the sweep, and
  // this reader stay on one object; the constant is the code-side default.
  const key = process.env['INDEX_KEY'] ?? TICKER_INDEX_KEY;
  const s3 = new S3Client({});
  return {
    get: async () => {
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return await result.Body?.transformToString();
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') return undefined;
        throw error;
      }
    },
    put: async (body) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json'
        })
      );
    }
  };
}

let loader: IndexLoader | undefined;

async function buildLoader(): Promise<IndexLoader> {
  const contactParameter = process.env['EDGAR_CONTACT_PARAMETER'];
  if (!contactParameter) throw new Error('EDGAR_CONTACT_PARAMETER is not set');
  const contact = await getCachedParameter(contactParameter);
  const client = new EdgarClient({ contact });
  return new IndexLoader({
    objectStore: buildObjectStore(),
    fetchFromSec: () => client.fetchTickerListings(),
    now: Date.now,
    log: (entry) => console.log(JSON.stringify(entry))
  });
}

/** Lambda entry point; everything is built lazily so tests can import the module bare. */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  loader ??= await buildLoader();
  return createSearchHandler(loader)(event);
};
