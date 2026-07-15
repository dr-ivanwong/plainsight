import { describe, expect, it } from 'vitest';

import { COLUMN_SEPARATOR, assembleLines, textItemsOf } from '../src/pdf/index.js';

const item = (str: string, x: number, y: number, width = str.length * 5) => ({
  str,
  x,
  y,
  width
});

describe('assembleLines', () => {
  it('groups items into lines by y within tolerance, top of page first', () => {
    const lines = assembleLines([
      item('below', 50, 100),
      item('title', 50, 700),
      item('same line', 78, 701.5)
    ]);
    expect(lines).toEqual(['title same line', 'below']);
  });

  it('renders column gaps as separators and small gaps as spaces', () => {
    const lines = assembleLines([
      item('Revenue', 50, 700, 40), // ends at 90
      item('2,343.1', 200, 700, 35), // gap 110: column
      item('note', 93, 700, 20), // gap 3: word space
      item('5', 113.5, 700, 5) // gap 0.5: same word
    ]);
    expect(lines).toEqual([`Revenue note5${COLUMN_SEPARATOR}2,343.1`]);
  });

  it('drops whitespace-only items', () => {
    expect(assembleLines([item('  ', 10, 10), item('x', 20, 10)])).toEqual(['x']);
  });
});

describe('textItemsOf', () => {
  it('keeps drawn text and skips marked-content markers', () => {
    const items = textItemsOf([
      { str: 'Revenue', transform: [1, 0, 0, 1, 50, 700], width: 40 },
      { type: 'beginMarkedContent' },
      null
    ]);
    expect(items).toEqual([{ str: 'Revenue', x: 50, y: 700, width: 40 }]);
  });
});
