import { readFileSync } from 'node:fs';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';

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
  ],
});
