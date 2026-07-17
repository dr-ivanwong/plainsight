// The exported file's exact shape: the writer's words under the four pinned
// headings, unwritten sections left out, named by ticker where one exists.
import { describe, expect, it } from 'vitest';

import { thesisFileName, thesisMarkdown } from './thesisMarkdown';

const sections = {
  business: 'Sells hardware people queue for.',
  moat: 'Ecosystem switching costs.',
  valuation: '',
  kills: ''
};

describe('thesisMarkdown', () => {
  it('lays the written sections under their headings, skipping the unwritten', () => {
    const text = thesisMarkdown({
      name: 'Apple Inc.',
      ticker: 'AAPL',
      sections,
      exportedOn: '2026-07-17'
    });
    expect(text).toBe(
      [
        '# Apple Inc. (AAPL) · Thesis',
        '',
        'Exported 2026-07-17 from Plainsight.',
        '',
        '## Business',
        '',
        'Sells hardware people queue for.',
        '',
        '## Moat',
        '',
        'Ecosystem switching costs.',
        ''
      ].join('\n')
    );
  });

  it('titles by name alone when no ticker exists', () => {
    const text = thesisMarkdown({
      name: 'Private Holdco',
      sections,
      exportedOn: '2026-07-17'
    });
    expect(text.startsWith('# Private Holdco · Thesis\n')).toBe(true);
  });
});

describe('thesisFileName', () => {
  it('names by ticker when one exists', () => {
    expect(thesisFileName({ name: 'Apple Inc.', ticker: 'AAPL' }, '2026-07-17')).toBe(
      'AAPL-thesis-2026-07-17.md'
    );
  });

  it('slugs the name when no ticker exists', () => {
    expect(thesisFileName({ name: "O'Brien & Sons Ltd." }, '2026-07-17')).toBe(
      'o-brien-sons-ltd-thesis-2026-07-17.md'
    );
  });
});
