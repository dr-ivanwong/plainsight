import { useCallback, useEffect, useState } from 'react';

export interface StorageStatus {
  /** Whether the browser has promised to keep this origin's data. */
  persisted: boolean;
  usage: number;
  quota: number;
  /** False where the storage API is absent; the screen says so instead of guessing. */
  supported: boolean;
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
      setStatus({ persisted: false, usage: 0, quota: 0, supported: false });
      return;
    }
    const [persisted, estimate] = await Promise.all([
      typeof storage.persisted === 'function' ? storage.persisted() : Promise.resolve(false),
      storage.estimate()
    ]);
    setStatus({
      persisted,
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      supported: true
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
