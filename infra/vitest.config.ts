import { basename, dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Snapshots live in test/snapshots/ (spec §4 layout), not the vitest
    // default of a __snapshots__ sibling directory.
    resolveSnapshotPath: (testPath, snapshotExtension) =>
      join(dirname(testPath), 'snapshots', `${basename(testPath)}${snapshotExtension}`),
  },
});
