import { readFileSync } from 'node:fs';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { pwaOptions } from './src/pwaOptions';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    // The router plugin must run before the React plugin.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      // Keep colocated tests (and any future Vanilla Extract styles) out of
      // the route scan; without this the generator treats them as routes.
      routeFileIgnorePattern: '\\.(test|spec)\\.tsx?$|\\.css\\.ts$',
    }),
    react(),
    vanillaExtractPlugin(),
    // The offline shell (main plan §5): every asset precached, so a total
    // backend outage or airplane mode leaves the app fully functional. The
    // options live in src/pwaOptions.ts so the update semantics (an update
    // waits for the next launch; nothing reloads mid-session) stay pinned by
    // a test.
    VitePWA(pwaOptions),
  ],
});
