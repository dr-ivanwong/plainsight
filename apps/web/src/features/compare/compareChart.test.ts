// End labels name each line where it finishes, and two lines finishing
// near-equal (the very case worth comparing) must not overprint: labels
// closer than a caption line push apart, top to bottom.
import { describe, expect, it } from 'vitest';

import { endLabelOffsets } from './CompareChart';

const finals = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('endLabelOffsets', () => {
  it('leaves well-separated labels alone', () => {
    const offsets = endLabelOffsets(finals({ a: 1.7, b: 0.2 }), [0.2, 0.5, 1.7]);
    expect(offsets.get('a')).toBe(0);
    expect(offsets.get('b')).toBe(0);
  });

  it('pushes near-equal finals a caption line apart', () => {
    const values = [0.2, 0.5, 1.33, 1.34, 2.5];
    const offsets = endLabelOffsets(finals({ apple: 1.34, cocaCola: 1.33 }), values);
    const span = 2.5 - 0.2;
    const appleY = ((2.5 - 1.34) / span) * 202 + (offsets.get('apple') ?? 0);
    const cocaColaY = ((2.5 - 1.33) / span) * 202 + (offsets.get('cocaCola') ?? 0);
    expect(cocaColaY - appleY).toBeGreaterThanOrEqual(13);
  });

  it('fans labels out when every plotted value is equal', () => {
    const offsets = endLabelOffsets(finals({ a: 1, b: 1, c: 1 }), [1, 1, 1]);
    expect([...offsets.values()].sort((x, y) => x - y)).toEqual([0, 13, 26]);
  });

  it('needs two labels to have anything to spread', () => {
    expect(endLabelOffsets(finals({ a: 1 }), [1, 2]).size).toBe(0);
  });
});
