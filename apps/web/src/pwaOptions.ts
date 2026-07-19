/**
 * The offline shell's contract (main plan section 5), as data so the update
 * semantics stay under test: an update installs beside the running app and
 * takes over on the next launch, never by reloading a session out from under
 * the owner (the no-lost-work discipline, main plan section 4; the pipeline
 * note in ci.yml says the same: updates land on the next visit).
 *
 * The three load-bearing choices:
 * - registerType 'prompt': the register client never reloads the page; with
 *   no prompt wired, the waiting worker simply waits (calm over chrome).
 * - skipWaiting absent: the new worker stays waiting until every client of
 *   the old one has closed, which is what "next launch" means.
 * - clientsClaim true: the very first install still takes control of the
 *   open page, so the shell is offline-capable from the first visit (the
 *   airplane-mode journey waits on exactly this).
 */
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  manifest: {
    name: 'Plainsight',
    short_name: 'Plainsight',
    description: 'Read financial statements like an owner.',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    background_color: '#F2F2F7',
    theme_color: '#F2F2F7',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      // The glyph sits inside the maskable safe zone, so one artwork serves both.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    navigateFallback: '/index.html',
    clientsClaim: true,
  },
  devOptions: { enabled: false },
};
