// The update semantics the offline shell promises (main plan section 4's
// no-lost-work discipline): a deploy must never reload the app out from
// under the owner. These assertions pin the three load-bearing choices;
// loosening one is a design change, not a test fix.
import { expect, it } from 'vitest';

import { pwaOptions } from './pwaOptions';

it('an update waits for the next launch instead of reloading the session', () => {
  // 'prompt' keeps the register client from reloading the page; with no
  // prompt wired, the waiting worker simply waits.
  expect(pwaOptions.registerType).toBe('prompt');
  // skipWaiting absent means the new worker stays waiting until the old
  // one's last client closes: that is what "next launch" means.
  expect(pwaOptions.workbox?.skipWaiting).toBeUndefined();
});

it('the first install still controls the open page', () => {
  // The airplane-mode journey waits for a controller on the first visit;
  // clientsClaim is what provides it when no previous worker exists.
  expect(pwaOptions.workbox?.clientsClaim).toBe(true);
});
