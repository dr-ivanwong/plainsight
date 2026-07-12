/**
 * The ingest entry point (backend spec §5, §10): invoked asynchronously by
 * the financials route on a cold ticker, and as a Step Functions task by the
 * weekly sweep. Idempotent per ticker via the profile lock; a repeated or
 * concurrent invoke is a cheap no-op.
 */
import { tickerSchema } from '@plainsight/api-contract';
import { z } from 'zod';
import { getCachedParameter } from '../aws/ssmParam.js';
import { TableStore } from '../db/table.js';
import { EdgarClient } from '../edgar/client.js';
import { runIngest, type IngestDeps, type IngestOutcome } from '../ingest/core.js';

const eventSchema = z.object({ ticker: tickerSchema });

let deps: IngestDeps | undefined;

async function buildDeps(): Promise<IngestDeps> {
  const contactParameter = process.env['EDGAR_CONTACT_PARAMETER'];
  if (!contactParameter) throw new Error('EDGAR_CONTACT_PARAMETER is not set');
  const contact = await getCachedParameter(contactParameter);
  return {
    client: new EdgarClient({ contact }),
    store: TableStore.fromEnv(),
    now: () => new Date()
  };
}

export const handler = async (event: unknown): Promise<IngestOutcome> => {
  const { ticker } = eventSchema.parse(event);
  deps ??= await buildDeps();
  const outcome = await runIngest(deps, ticker);
  console.log(JSON.stringify({ route: 'ingestTicker', ...outcome }));
  return outcome;
};
