import { useSyncExternalStore } from 'react';

/**
 * A live media-query match through the store contract the house state
 * pattern uses (main plan §5). Environments without matchMedia (jsdom)
 * read as not matching, which keeps narrow-first fallbacks honest.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  );
}
