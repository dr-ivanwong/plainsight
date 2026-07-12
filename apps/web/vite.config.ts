import { readFileSync } from 'node:fs';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    // backend outage or airplane mode leaves the app fully functional.
    VitePWA({
      registerType: 'autoUpdate',
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
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
