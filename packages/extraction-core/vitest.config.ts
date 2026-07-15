import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text'],
      // Small and pure, like api-contract: the registry routes real spend,
      // the schemas gate what reaches the entry grid, and the prompt is a
      // versioned artefact; an unexercised branch is an untested rule.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100
      }
    }
  }
});
