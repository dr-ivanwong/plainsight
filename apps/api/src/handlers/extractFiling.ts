/**
 * The ASX extraction entry point (backend spec §5, §10): invoked
 * asynchronously by the ingest router for .AX tickers, on demand and on
 * sweep. Composes the whole Phase 2.5 engine: MAP client, preprocessor,
 * cheap-first ladder over the SSM-held provider keys, conversion, the
 * pinned gates, and the DOC# extract-once cache. Rungs whose key parameter
 * is absent are skipped by the ladder; with no keys at all the function
 * declines loudly instead of quarantining every document, which is the
 * graceful state between deploying the stack and creating the parameters.
 */
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { tickerSchema } from '@plainsight/api-contract';
import {
  REGISTRY,
  ladderFor,
  runExtraction,
  type PreparedDocument
} from '@plainsight/extraction-core';
import { preprocessPdf } from '@plainsight/extraction-core/pdf';
import { z } from 'zod';

import { DocumentCache } from '../asx/documents.js';
import { MapClient } from '../asx/client.js';
import { getCachedParameter } from '../aws/ssmParam.js';
import { TableStore } from '../db/table.js';
import { runAsxIngest, type AsxIngestDeps, type AsxIngestOutcome } from '../ingest/asxCore.js';

const eventSchema = z.object({
  ticker: tickerSchema,
  mode: z.enum(['on_demand', 'sweep']).optional()
});

export type ExtractFilingOutcome = AsxIngestOutcome | { outcome: 'disabled'; ticker: string };

/** A missing key parameter skips the rung; the ladder walks what exists. */
async function credentialFor(parameterName: string): Promise<string | undefined> {
  try {
    return await getCachedParameter(parameterName);
  } catch {
    return undefined;
  }
}

async function buildInvalidator(): Promise<AsxIngestDeps['invalidateEdge']> {
  const parameterName = process.env['DISTRIBUTION_ID_PARAMETER'];
  if (!parameterName) return undefined;
  let distributionId: string;
  try {
    distributionId = await getCachedParameter(parameterName);
  } catch {
    console.log(
      JSON.stringify({
        route: 'extractFiling',
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

async function buildDeps(): Promise<AsxIngestDeps> {
  const contactParameter = process.env['CONTACT_PARAMETER'];
  if (!contactParameter) throw new Error('CONTACT_PARAMETER is not set');
  const contact = await getCachedParameter(contactParameter);
  const tableName = process.env['TABLE_NAME'];
  if (!tableName) throw new Error('TABLE_NAME is not set');
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true }
  });

  // Text-layer ladder: the Lambda carries no rasteriser (scanned documents
  // quarantine at preprocessing; see asxCore), so vision need never routes.
  const ladder = ladderFor({ needsVision: false, confidential: false });
  const extract = (document: PreparedDocument) =>
    runExtraction({
      document,
      ladder,
      credentialFor: (entry) => credentialFor(entry.credentialParameter),
      adapterConfig: { timeoutMs: 100_000 }
    });

  return {
    map: new MapClient({ contact }),
    store: TableStore.fromEnv(),
    documents: new DocumentCache(documentClient, tableName),
    preprocess: (bytes) => preprocessPdf(bytes),
    extract,
    now: () => new Date(),
    invalidateEdge: await buildInvalidator()
  };
}

/** True when at least one rung has a key parameter; false declines the run. */
async function anyCredentialConfigured(): Promise<boolean> {
  for (const entry of REGISTRY) {
    if ((await credentialFor(entry.credentialParameter)) !== undefined) return true;
  }
  return false;
}

let deps: AsxIngestDeps | undefined;

export const handler = async (event: unknown): Promise<ExtractFilingOutcome> => {
  const { ticker, mode } = eventSchema.parse(event);
  if (!(await anyCredentialConfigured())) {
    const outcome = { outcome: 'disabled' as const, ticker };
    console.log(
      JSON.stringify({ route: 'extractFiling', ...outcome, detail: 'no provider key parameters exist' })
    );
    return outcome;
  }
  deps ??= await buildDeps();
  const outcome = await runAsxIngest(deps, ticker, mode ?? 'on_demand');
  console.log(JSON.stringify({ route: 'extractFiling', ...outcome }));
  return outcome;
};
