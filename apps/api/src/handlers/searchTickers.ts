/**
 * GET /v1/search?q=…&pageToken=… (backend spec §2, §8): the in-memory ticker
 * search over both markets' lists, EDGAR plus the ASX directory, merged
 * before ranking so exchange badges disambiguate colliding symbols. No
 * search infrastructure, single-digit-millisecond queries once the index is
 * warm. An unreadable ASX list degrades to EDGAR-only rather than failing
 * the route: one market's outage never hides the other.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { errorEnvelope, searchResponseSchema } from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { getCachedParameter } from '../aws/ssmParam.js';
import { MapClient } from '../asx/client.js';
import { EdgarClient } from '../edgar/client.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import {
  ASX_DIRECTORY_KEY,
  IndexLoader,
  parseAsxDirectoryObject,
  parseTickerIndexObject,
  serialiseAsxDirectory,
  serialiseTickerIndex,
  TICKER_INDEX_KEY,
  type IndexObjectStore
} from '../search/load.js';
import { decodePageToken, searchListings, type SearchListing } from '../search/search.js';

const MAX_QUERY_LENGTH = 40;

export function createSearchHandler(loadAll: () => Promise<SearchListing[]>) {
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

      const listings = await loadAll();
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

/** Both markets merged; the ASX list degrades to empty rather than failing. */
export function mergedLoad(edgar: IndexLoader, asx: IndexLoader): () => Promise<SearchListing[]> {
  return async () => {
    const edgarListings = await edgar.load();
    let asxListings: SearchListing[] = [];
    try {
      asxListings = await asx.load();
    } catch (error) {
      console.log(
        JSON.stringify({
          route: 'searchTickers',
          outcome: 'asx_directory_unavailable',
          detail: error instanceof Error ? error.message : String(error)
        })
      );
    }
    return [...edgarListings, ...asxListings];
  };
}

function buildObjectStore(key: string): IndexObjectStore | undefined {
  const bucket = process.env['INDEX_BUCKET'];
  if (!bucket) return undefined;
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

let load: (() => Promise<SearchListing[]>) | undefined;

async function buildLoad(): Promise<() => Promise<SearchListing[]>> {
  const contactParameter = process.env['EDGAR_CONTACT_PARAMETER'];
  if (!contactParameter) throw new Error('EDGAR_CONTACT_PARAMETER is not set');
  const contact = await getCachedParameter(contactParameter);
  const log = (entry: Record<string, string>) => console.log(JSON.stringify(entry));

  const edgarClient = new EdgarClient({ contact });
  const edgar = new IndexLoader({
    objectStore: buildObjectStore(process.env['INDEX_KEY'] ?? TICKER_INDEX_KEY),
    fetchFromOrigin: () => edgarClient.fetchTickerListings(),
    parse: parseTickerIndexObject,
    serialise: serialiseTickerIndex,
    now: Date.now,
    log
  });

  const mapClient = new MapClient({ contact });
  const asx = new IndexLoader({
    objectStore: buildObjectStore(process.env['ASX_INDEX_KEY'] ?? ASX_DIRECTORY_KEY),
    fetchFromOrigin: () => mapClient.fetchListedCompanies(),
    parse: parseAsxDirectoryObject,
    serialise: serialiseAsxDirectory,
    now: Date.now,
    log
  });

  return mergedLoad(edgar, asx);
}

/** Lambda entry point; everything is built lazily so tests can import the module bare. */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  load ??= await buildLoad();
  return createSearchHandler(load)(event);
};
