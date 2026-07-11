import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text'],
      // The data-model spec (main plan section 5) targets 100% branch coverage on
      // this package; it is small enough that this is cheap, and it is the
      // product's credibility. Enforced, not aspirational.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100
      }
    }
  }
});
