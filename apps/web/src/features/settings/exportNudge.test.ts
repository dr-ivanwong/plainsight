// The 30-day export nudge boundary (main plan section 14): overdue means no
// export at all, an unreadable stamp, or strictly more than 30 days.
import { describe, expect, it } from 'vitest';

import { exportOverdue } from './exportNudge';

const NOW = new Date('2026-07-20T10:00:00Z');

describe('exportOverdue', () => {
  it('a device that has never exported is overdue', () => {
    expect(exportOverdue(undefined, NOW)).toBe(true);
  });

  it('an unreadable stamp counts as overdue rather than as fresh', () => {
    expect(exportOverdue('not a date', NOW)).toBe(true);
  });

  it('holds quiet through day 30 and speaks after it', () => {
    expect(exportOverdue('2026-07-19T10:00:00Z', NOW)).toBe(false);
    expect(exportOverdue('2026-06-20T10:00:00Z', NOW)).toBe(false); // exactly 30 days
    expect(exportOverdue('2026-06-20T09:59:59Z', NOW)).toBe(true);
    expect(exportOverdue('2026-05-01T00:00:00Z', NOW)).toBe(true);
  });
});
