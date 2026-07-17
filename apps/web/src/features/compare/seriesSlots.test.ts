// The slot rule for trend lines: colour follows the company, never its rank.
// Unpicking one company must not repaint the survivors, and a newcomer takes
// the lowest freed slot.
import { describe, expect, it } from 'vitest';

import { assignSlots } from './seriesSlots';

const slots = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('assignSlots', () => {
  it('assigns fresh ids in order from slot zero', () => {
    expect(assignSlots(new Map(), ['a', 'b', 'c'])).toEqual(slots({ a: 0, b: 1, c: 2 }));
  });

  it('keeps survivors in place when a company leaves', () => {
    const previous = assignSlots(new Map(), ['a', 'b', 'c']);
    expect(assignSlots(previous, ['a', 'c'])).toEqual(slots({ a: 0, c: 2 }));
  });

  it('hands a newcomer the freed slot without touching anyone else', () => {
    const previous = assignSlots(new Map(), ['a', 'b', 'c']);
    const afterLeave = assignSlots(previous, ['a', 'c']);
    expect(assignSlots(afterLeave, ['a', 'c', 'd'])).toEqual(slots({ a: 0, c: 2, d: 1 }));
  });

  it('lets a returning company take whichever slot is free', () => {
    const previous = slots({ a: 0, c: 2, d: 1 });
    expect(assignSlots(previous, ['a', 'c', 'd', 'b'])).toEqual(
      slots({ a: 0, c: 2, d: 1, b: 3 })
    );
  });

  it('caps assignment at the pick limit', () => {
    const assigned = assignSlots(new Map(), ['a', 'b', 'c', 'd', 'e']);
    expect(assigned.size).toBe(4);
    expect(assigned.has('e')).toBe(false);
  });
});
