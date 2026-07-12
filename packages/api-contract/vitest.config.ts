import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text'],
      // The schemas in this package are the frozen API contract (backend spec
      // section 2). The package is small and pure, so full coverage is cheap,
      // and an unexercised branch here is an untested clause of the contract.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100
      }
    }
  }
});
