import { useCallback, useEffect, useState } from 'react';

/**
 * The proactive-detection threshold (main plan §14: quota exhaustion is
 * surfaced before writes begin failing). Browsers refuse writes at the
 * quota itself, so four fifths leaves real headroom to export first.
 */
export const STORAGE_PRESSURE_RATIO = 0.8;

export interface StorageStatus {
  /** Whether the browser has promised to keep this origin's data. */
  persisted: boolean;
  usage: number;
  quota: number;
  /** False where the storage API is absent; the screen says so instead of guessing. */
  supported: boolean;
  /** True when usage crosses the pressure threshold; feeds the entry-screen banner. */
  pressure: boolean;
}

/**
 * Persistence and quota, straight from navigator.storage (frontend spec §6).
 * requestPersist asks the browser to persist the origin and refreshes the
 * status with its answer; browsers decide by their own heuristics and may
 * silently decline.
 */
export function useStorageStatus(): {
  status: StorageStatus | undefined;
  requestPersist: () => Promise<void>;
} {
  const [status, setStatus] = useState<StorageStatus>();

  const read = useCallback(async () => {
    const storage = navigator.storage as StorageManager | undefined;
    if (storage === undefined || typeof storage.estimate !== 'function') {
      setStatus({ persisted: false, usage: 0, quota: 0, supported: false, pressure: false });
      return;
    }
    const [persisted, estimate] = await Promise.all([
      typeof storage.persisted === 'function' ? storage.persisted() : Promise.resolve(false),
      storage.estimate()
    ]);
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    setStatus({
      persisted,
      usage,
      quota,
      supported: true,
      pressure: quota > 0 && usage / quota >= STORAGE_PRESSURE_RATIO
    });
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const requestPersist = useCallback(async () => {
    const storage = navigator.storage as StorageManager | undefined;
    if (storage !== undefined && typeof storage.persist === 'function') {
      await storage.persist();
    }
    await read();
  }, [read]);

  return { status, requestPersist };
}
