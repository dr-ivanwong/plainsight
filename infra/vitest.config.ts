import { basename, dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The snapshot and cdk-nag tests synthesise the whole app, which runs
    // 6 to 9 seconds on a cold cache: past vitest's 5-second default, so a
    // cold run flaked while a warm one passed. Synth deserves a generous
    // ceiling; this is a budget for slow honesty, not a hang allowance.
    testTimeout: 120_000,
    // Snapshots live in test/snapshots/ (spec §4 layout), not the vitest
    // default of a __snapshots__ sibling directory.
    resolveSnapshotPath: (testPath, snapshotExtension) =>
      join(dirname(testPath), 'snapshots', `${basename(testPath)}${snapshotExtension}`),
  },
});
