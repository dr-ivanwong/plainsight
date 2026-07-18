/**
 * The sync cadence (main plan §5): silent, retried, never blocking. A run at
 * launch when a session exists, another whenever the network comes back, and
 * a quiet interval in between. Failures say nothing; the settings row's
 * "last synced" line is the only surface.
 */
import { useEffect } from 'react';
import { getAccessToken } from '../auth/session';
import { db } from '../db';
import { runSync, type SyncDeps } from './engine';

const INTERVAL_MS = 5 * 60 * 1000;

export const defaultSyncDeps = (): SyncDeps => ({
  db,
  accessToken: () => getAccessToken(),
  fetchImpl: (input, init) => fetch(input, init),
  now: () => new Date(),
  newId: () => crypto.randomUUID()
});

let running = false;

/** One run at a time; overlapping timers collapse into the run in flight. */
export async function syncOnce(deps: SyncDeps = defaultSyncDeps()): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runSync(deps);
  } finally {
    running = false;
  }
}

export function useSyncRunner(): void {
  useEffect(() => {
    void syncOnce();
    const timer = setInterval(() => void syncOnce(), INTERVAL_MS);
    const onOnline = (): void => void syncOnce();
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
