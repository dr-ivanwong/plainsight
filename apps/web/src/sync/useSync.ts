/**
 * Sync glue: the scheduler policy (scheduler.ts) wired to the app. Reads
 * revalidate through the API on launch, on reconnect, on returning to the
 * app, and on sign-in; queued writes drain soon after they land and retry
 * with backoff until the server accepts them (main plan §12.9). The interval
 * is the fallback ceiling, not the cadence. Failures stay quiet; the
 * settings sync row is the surface.
 */
import { liveQuery } from 'dexie';
import { useEffect, useSyncExternalStore } from 'react';

import { getAccessToken } from '../auth/session';
import { db } from '../db';
import { runSync, type SyncDeps } from './engine';
import { countPendingWrites } from './pending';
import { SyncScheduler, type SyncSnapshot } from './scheduler';

const INTERVAL_MS = 5 * 60 * 1000;

export const defaultSyncDeps = (): SyncDeps => ({
  db,
  accessToken: () => getAccessToken(),
  fetchImpl: (input, init) => fetch(input, init),
  now: () => new Date(),
  newId: () => crypto.randomUUID()
});

/** The app-wide scheduler; tests build their own SyncScheduler instances. */
export const appScheduler = new SyncScheduler({
  run: async () => (await runSync(defaultSyncDeps())).outcome,
  setTimer: (handler, ms) => window.setTimeout(handler, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
  now: () => Date.now()
});

export function useSyncRunner(): void {
  useEffect(() => {
    appScheduler.revalidate('launch');
    const onOnline = (): void => appScheduler.revalidate('online');
    const onFocus = (): void => appScheduler.revalidate('focus');
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') appScheduler.revalidate('focus');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => appScheduler.revalidate('interval'), INTERVAL_MS);

    // The queue watcher: any local write (or a session change) reports the
    // pending diff, and the scheduler decides whether anything should run.
    const watcher = liveQuery(async () => ({
      signedIn: (await db.meta.get('authSession')) !== undefined,
      pending: await countPendingWrites(db)
    })).subscribe({
      next: (state) => appScheduler.notePending(state.pending, state.signedIn),
      error: () => undefined
    });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      watcher.unsubscribe();
    };
  }, []);
}

/** The scheduler's snapshot, for reads that gate on the first catch-up. */
export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(
    (listener) => appScheduler.subscribe(listener),
    () => appScheduler.getSnapshot()
  );
}
