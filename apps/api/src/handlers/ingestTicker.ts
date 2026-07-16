/**
 * The ingest entry point (backend spec §5, §10): invoked asynchronously by
 * the financials route on a cold ticker, and as a Step Functions task by the
 * weekly sweep. Idempotent per ticker via the profile lock; a repeated or
 * concurrent invoke is a cheap no-op.
 */
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { tickerSchema } from '@plainsight/api-contract';
import { z } from 'zod';
import { getCachedParameter } from '../aws/ssmParam.js';
import { TableStore } from '../db/table.js';
import { EdgarClient } from '../edgar/client.js';
import { asxCodeOf } from '../ingest/asxCore.js';
import { runIngest, type IngestDeps, type IngestOutcome } from '../ingest/core.js';

const eventSchema = z.object({
  ticker: tickerSchema,
  /** 'sweep' turns on the submissions change detector (backend spec §5). */
  mode: z.enum(['on_demand', 'sweep']).optional()
});

let deps: IngestDeps | undefined;

/**
 * The edge invalidator (backend spec §5): the distribution id is published to
 * SSM by the StaticSite stack once the API rides behind CloudFront, and read
 * here at runtime, which keeps the stacks acyclic (StaticSite depends on Api,
 * so nothing in the ingest path can reference it at deploy time). No
 * parameter means no edge to invalidate.
 */
async function buildInvalidator(): Promise<IngestDeps['invalidateEdge']> {
  const parameterName = process.env['DISTRIBUTION_ID_PARAMETER'];
  if (!parameterName) return undefined;
  let distributionId: string;
  try {
    distributionId = await getCachedParameter(parameterName);
  } catch {
    console.log(
      JSON.stringify({
        route: 'ingestTicker',
        outcome: 'no_distribution_parameter',
        parameter: parameterName
      })
    );
    return undefined;
  }
  const cloudfront = new CloudFrontClient({});
  return async (ticker) => {
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${ticker}-${Date.now()}`,
          Paths: { Quantity: 1, Items: [`/v1/companies/${ticker}/financials*`] }
        }
      })
    );
  };
}

async function buildDeps(): Promise<IngestDeps> {
  const contactParameter = process.env['EDGAR_CONTACT_PARAMETER'];
  if (!contactParameter) throw new Error('EDGAR_CONTACT_PARAMETER is not set');
  const contact = await getCachedParameter(contactParameter);
  return {
    client: new EdgarClient({ contact }),
    store: TableStore.fromEnv(),
    now: () => new Date(),
    invalidateEdge: await buildInvalidator()
  };
}

/** The ingest router's one fork: .AX tickers belong to the extraction engine. */
export type RoutedOutcome = IngestOutcome | { outcome: 'delegated'; ticker: string };

let lambda: LambdaClient | undefined;

/**
 * ASX tickers delegate to the extraction function asynchronously: it owns
 * the 300-second budget the ladder needs, while this function keeps the
 * EDGAR fast path and stays the single front door for the financials route
 * and the sweep alike. No extraction function configured means ASX ingestion
 * is off: the ticker stays cold and the client's 202 caps out, the same
 * degraded state as any other missing ingestion wiring.
 */
async function delegateToExtraction(ticker: string, mode: string): Promise<RoutedOutcome> {
  const functionName = process.env['EXTRACT_FUNCTION_NAME'];
  if (!functionName) {
    console.log(JSON.stringify({ route: 'ingestTicker', outcome: 'asx_ingestion_off', ticker }));
    return { outcome: 'delegated', ticker };
  }
  lambda ??= new LambdaClient({});
  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify({ ticker, mode })
    })
  );
  return { outcome: 'delegated', ticker };
}

export const handler = async (event: unknown): Promise<RoutedOutcome> => {
  const { ticker, mode } = eventSchema.parse(event);
  if (asxCodeOf(ticker) !== undefined) {
    const outcome = await delegateToExtraction(ticker, mode ?? 'on_demand');
    console.log(JSON.stringify({ route: 'ingestTicker', ...outcome }));
    return outcome;
  }
  deps ??= await buildDeps();
  const outcome = await runIngest(deps, ticker, mode ?? 'on_demand');
  console.log(JSON.stringify({ route: 'ingestTicker', ...outcome }));
  return outcome;
};
