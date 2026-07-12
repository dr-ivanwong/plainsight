/**
 * GET /v1/companies/{ticker}/financials (backend spec §2): the standardised
 * annual statements plus gaps. A cold ticker (no profile yet) answers 202
 * with the ingesting envelope and fires the ingest asynchronously (spec §5);
 * the ingest's own lock makes repeated fires cheap no-ops. Partial data
 * degrades, never 500s: whatever years exist are served, with the missing
 * labels named in gaps.
 */
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  errorEnvelope,
  financialsResponseSchema,
  ingestingBody,
  type FinancialsStatement
} from '@plainsight/api-contract';
import { compareFyLabels, fyLabelOf, fyYear, type FyLabel } from '@plainsight/calc-engine';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { TableReadStore, type FinancialsReadStore } from '../db/table.js';
import { parseFinancialsQuery, parseTicker } from '../http/params.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';

/** Fires the async ingest for a cold ticker; a failure to fire must never break the 202. */
export type IngestTrigger = (ticker: string) => Promise<void>;

export const INGESTING_RETRY_AFTER_SECONDS = 5;

const STATEMENT_ORDER = { income: 0, balance: 1, cashflow: 2 } as const;

/**
 * The served window: the most recent `years` labelled years present, and the
 * labels missing inside that window's span. A ticker with eight of ten years
 * serves eight years plus the two gap labels (backend spec §2).
 */
export function serveWindow(
  rows: FinancialsStatement[],
  years: number
): { statements: FinancialsStatement[]; gaps: FyLabel[] } {
  const labels = [...new Set(rows.map((row) => row.fy))].sort(compareFyLabels);
  const served = new Set(labels.slice(-years));
  const statements = rows
    .filter((row) => served.has(row.fy))
    .sort(
      (a, b) => compareFyLabels(a.fy, b.fy) || STATEMENT_ORDER[a.statement] - STATEMENT_ORDER[b.statement]
    );
  const gaps: FyLabel[] = [];
  if (served.size > 0) {
    const servedLabels = [...served].sort(compareFyLabels);
    const first = fyYear(servedLabels[0] as FyLabel);
    const last = fyYear(servedLabels.at(-1) as FyLabel);
    for (let year = first + 1; year < last; year += 1) {
      if (!served.has(fyLabelOf(year))) gaps.push(fyLabelOf(year));
    }
  }
  return { statements, gaps };
}

export function createFinancialsHandler(store: FinancialsReadStore, triggerIngest?: IngestTrigger) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const ticker = parseTicker(event.pathParameters?.['ticker']);
      if (!ticker.ok) {
        return jsonResponse(400, errorEnvelope('invalid_request', ticker.message, requestId));
      }
      const query = parseFinancialsQuery(event.queryStringParameters);
      if (!query.ok) {
        return jsonResponse(400, errorEnvelope('invalid_request', query.message, requestId));
      }

      const profile = await store.getProfile(ticker.value);
      if (profile === undefined) {
        if (triggerIngest !== undefined) {
          try {
            await triggerIngest(ticker.value);
          } catch (error) {
            // The 202 stands either way: the client retries, and the next
            // request fires again.
            logOutcome({
              requestId,
              route: 'getFinancials',
              outcome: 'ingest_fire_failed',
              detail: error instanceof Error ? error.message : String(error)
            });
          }
        }
        logOutcome({ requestId, route: 'getFinancials', outcome: 'ingesting' });
        return jsonResponse(202, ingestingBody(INGESTING_RETRY_AFTER_SECONDS, requestId));
      }

      const rows = await store.listStatementRows(ticker.value);
      const requested = new Set(query.value.statements);
      const { statements, gaps } = serveWindow(
        rows.filter((row) => requested.has(row.statement)),
        query.value.years
      );
      // Self-check at the boundary: a response that violates the contract is
      // a server defect and must fail here, not in a client.
      const body = financialsResponseSchema.parse({ ticker: ticker.value, statements, gaps });
      logOutcome({ requestId, route: 'getFinancials', outcome: 'ok' });
      return jsonResponse(200, body);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'getFinancials',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong serving these financials.', requestId)
      );
    }
  };
}

let store: FinancialsReadStore | undefined;
let trigger: IngestTrigger | undefined;

/**
 * The real trigger: an async (Event) invoke of the ingest function named in
 * the environment. Absent the wiring (api on, ingestion off), cold tickers
 * still answer 202 and simply never warm, a coherent degraded state.
 */
function buildTrigger(): IngestTrigger | undefined {
  const functionName = process.env['INGEST_FUNCTION_NAME'];
  if (!functionName) return undefined;
  const lambda = new LambdaClient({});
  return async (ticker) => {
    await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: JSON.stringify({ ticker })
      })
    );
  };
}

/** Lambda entry point; the store is built lazily so tests can import this module without a table. */
export const handler = (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  store ??= TableReadStore.fromEnv();
  trigger ??= buildTrigger();
  return createFinancialsHandler(store, trigger)(event);
};
