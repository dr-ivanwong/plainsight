import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Connectivity, for feature-hiding only (frontend spec §6): offline is a
 * normal operating mode, never an alarm, so the sole consumers are the
 * online-only affordances the degradation matrix hides and the quiet pill
 * that marks their absence (frontend spec §2).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
