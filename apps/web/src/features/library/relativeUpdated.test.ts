import { describe, expect, it } from 'vitest';

import { relativeUpdated } from './relativeUpdated';

// Local-time reference: assertions cross day boundaries, not timezones.
const NOW = new Date(2026, 6, 11, 10, 0, 0);

describe('relativeUpdated', () => {
  it('names the near past in relative words', () => {
    expect(relativeUpdated(new Date(2026, 6, 11, 1, 0, 0).toISOString(), NOW)).toBe(
      'updated today'
    );
    expect(relativeUpdated(new Date(2026, 6, 10, 23, 0, 0).toISOString(), NOW)).toBe(
      'updated yesterday'
    );
    expect(relativeUpdated(new Date(2026, 6, 8, 12, 0, 0).toISOString(), NOW)).toBe(
      'updated 3 days ago'
    );
  });

  it('names a specific day in the house date format beyond a week', () => {
    expect(relativeUpdated(new Date(2026, 6, 1, 12, 0, 0).toISOString(), NOW)).toBe(
      'updated 2026-07-01'
    );
  });

  it('reads a future timestamp (clock skew) as today', () => {
    expect(relativeUpdated(new Date(2026, 6, 12, 9, 0, 0).toISOString(), NOW)).toBe(
      'updated today'
    );
  });
});
