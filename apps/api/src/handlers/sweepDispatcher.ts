/**
 * The weekly sweep dispatcher (backend spec §5, §8): refresh the search
 * index copy in S3, list the watched tickers from the sparse index, and
 * start the Step Functions map that sweeps them (concurrency capped by the
 * state machine, pacing writes under the capacity ceiling). Watched tickers
 * are the ones a first successful ingest marked; nothing else is ever swept.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { getCachedParameter } from '../aws/ssmParam.js';
import { MapClient } from '../asx/client.js';
import { TableStore, type SweepStore } from '../db/table.js';
import { EdgarClient } from '../edgar/client.js';
import { ASX_DIRECTORY_KEY, serialiseAsxDirectory, serialiseTickerIndex, TICKER_INDEX_KEY } from '../search/load.js';

export interface SweepDispatcherDeps {
  client: EdgarClient;
  /** The ASX directory refresh (backend spec §8); absent when unwired. */
  mapClient?: MapClient | undefined;
  store: SweepStore;
  putIndexObject: ((body: string) => Promise<void>) | undefined;
  putAsxDirectoryObject?: ((body: string) => Promise<void>) | undefined;
  startSweep: (tickers: string[]) => Promise<void>;
  log: (entry: Record<string, string | number>) => void;
}

export interface SweepDispatchOutcome {
  outcome: 'dispatched' | 'nothing_watched';
  tickers: number;
  indexRefreshed: boolean;
  asxDirectoryRefreshed: boolean;
}

export async function runSweepDispatch(deps: SweepDispatcherDeps): Promise<SweepDispatchOutcome> {
  // The index refreshes keep ticker search current (backend spec §8); a
  // failure in either must not cost the sweep itself, or the other market.
  let indexRefreshed = false;
  if (deps.putIndexObject !== undefined) {
    try {
      const listings = await deps.client.fetchTickerListings();
      await deps.putIndexObject(serialiseTickerIndex(listings));
      indexRefreshed = true;
    } catch (error) {
      deps.log({
        route: 'sweepDispatcher',
        outcome: 'index_refresh_failed',
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  let asxDirectoryRefreshed = false;
  if (deps.putAsxDirectoryObject !== undefined && deps.mapClient !== undefined) {
    try {
      const listings = await deps.mapClient.fetchListedCompanies();
      await deps.putAsxDirectoryObject(serialiseAsxDirectory(listings));
      asxDirectoryRefreshed = true;
    } catch (error) {
      deps.log({
        route: 'sweepDispatcher',
        outcome: 'asx_directory_refresh_failed',
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const tickers = await deps.store.listWatchedTickers();
  if (tickers.length === 0) {
    return { outcome: 'nothing_watched', tickers: 0, indexRefreshed, asxDirectoryRefreshed };
  }
  await deps.startSweep(tickers);
  return { outcome: 'dispatched', tickers: tickers.length, indexRefreshed, asxDirectoryRefreshed };
}

let deps: SweepDispatcherDeps | undefined;

async function buildDeps(): Promise<SweepDispatcherDeps> {
  const contactParameter = process.env['EDGAR_CONTACT_PARAMETER'];
  if (!contactParameter) throw new Error('EDGAR_CONTACT_PARAMETER is not set');
  const stateMachineArn = process.env['STATE_MACHINE_ARN'];
  if (!stateMachineArn) throw new Error('STATE_MACHINE_ARN is not set');
  const contact = await getCachedParameter(contactParameter);

  const bucket = process.env['INDEX_BUCKET'];
  const key = process.env['INDEX_KEY'] ?? TICKER_INDEX_KEY;
  const asxKey = process.env['ASX_INDEX_KEY'] ?? ASX_DIRECTORY_KEY;
  const s3 = bucket ? new S3Client({}) : undefined;
  const sfn = new SFNClient({});
  const putObject =
    s3 === undefined || bucket === undefined
      ? undefined
      : (objectKey: string) => async (body: string) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              Body: body,
              ContentType: 'application/json'
            })
          );
        };

  return {
    client: new EdgarClient({ contact }),
    mapClient: new MapClient({ contact }),
    store: TableStore.fromEnv(),
    putIndexObject: putObject?.(key),
    putAsxDirectoryObject: putObject?.(asxKey),
    startSweep: async (tickers) => {
      await sfn.send(
        new StartExecutionCommand({
          stateMachineArn,
          input: JSON.stringify({ tickers })
        })
      );
    },
    log: (entry) => console.log(JSON.stringify(entry))
  };
}

export const handler = async (): Promise<SweepDispatchOutcome> => {
  deps ??= await buildDeps();
  const outcome = await runSweepDispatch(deps);
  console.log(JSON.stringify({ route: 'sweepDispatcher', ...outcome }));
  return outcome;
};
