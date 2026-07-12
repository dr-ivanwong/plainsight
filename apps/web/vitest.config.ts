// Deliberately separate from vite.config.ts: Vitest must not run the TanStack
// Router plugin (its codegen writes to src/ as a side effect). Tests default
// to the Node environment; component tests opt in to jsdom with a
// `@vitest-environment jsdom` docblock per file.
import { readFileSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), vanillaExtractPlugin()],
  test: {
    environment: 'node',
    // Tests import describe/expect/it explicitly; globals stay on so Testing
    // Library can register its automatic afterEach cleanup.
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
