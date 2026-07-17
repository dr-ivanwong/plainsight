// The best-in-row rule (frontend spec §3): the tick goes to every tied
// leader, respects lower-is-better metrics, and stays away entirely when
// fewer than two values compare or when nothing stands out.
import type { MetricValue } from '@plainsight/calc-engine';
import { describe, expect, it } from 'vitest';

import { bestOfRow } from './ComparisonTable';

const ok = (value: number): MetricValue => ({ status: 'ok', value });

describe('bestOfRow', () => {
  it('ticks the highest value when higher is better', () => {
    expect(bestOfRow([ok(0.1), ok(0.2), ok(0.15)], true)).toEqual(new Set([1]));
  });

  it('ticks the lowest value where lower is better', () => {
    expect(bestOfRow([ok(2.1), ok(0.5)], false)).toEqual(new Set([1]));
  });

  it('ticks every tied leader', () => {
    expect(bestOfRow([ok(10), ok(10), ok(8)], true)).toEqual(new Set([0, 1]));
  });

  it('ticks nothing when all comparable values are equal', () => {
    expect(bestOfRow([ok(1), ok(1)], true)).toEqual(new Set());
  });

  it('needs at least two comparable values', () => {
    const degenerate: MetricValue = { status: 'not_meaningful', reason: 'negative_equity' };
    expect(bestOfRow([ok(10), degenerate, null], true)).toEqual(new Set());
  });

  it('compares around degenerate values, not through them', () => {
    const missing: MetricValue = { status: 'insufficient_data', missing: ['totalEquity'] };
    expect(bestOfRow([ok(0.1), missing, ok(0.3)], true)).toEqual(new Set([2]));
  });
});
