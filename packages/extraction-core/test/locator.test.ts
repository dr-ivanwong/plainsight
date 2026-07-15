import { describe, expect, it } from 'vitest';

import { locateStatements, pageSignals } from '../src/pdf/index.js';

/** A dense numbers row, the signature of a real statement grid. */
const numbersRow = () =>
  Array.from({ length: 30 }, (_, index) => `${(index + 1) * 137},${100 + index}.5`).join('  |  ');

const CONJUNCTION_FOOTER =
  'The above statement should be read in conjunction with the accompanying notes.';

const incomeFace = [
  'Income statement',
  'For the year ended 30 June 2025',
  'Revenue  |  2,343.1  |  2,235.6',
  'Gross profit  |  1,727.9  |  1,673.5',
  'Profit before income tax  |  518.5  |  484.8',
  numbersRow(),
  CONJUNCTION_FOOTER
];
const balanceFace = [
  'Balance sheet',
  'As at 30 June 2025',
  'Total current assets  |  1,416.8  |  1,452.1',
  'Total equity  |  1,950.3  |  1,840.5',
  numbersRow(),
  CONJUNCTION_FOOTER
];
const cashflowFace = [
  'Statement of cash flows',
  'For the year ended 30 June 2025',
  'Net cash provided by operating activities  |  237.6  |  388.8',
  numbersRow(),
  CONJUNCTION_FOOTER
];
const contents = [
  'Contents',
  'Income statement  |  113',
  'Balance sheet  |  114',
  'Statement of cash flows  |  117'
];
const prose = ['The directors present their report for the year ended 30 June 2025.'];
const epsNote = [
  'Earnings per share',
  'Weighted average number of ordinary shares (diluted)  |  65,606,224'
];

describe('locateStatements', () => {
  it('anchors on the first real face, not the contents page, and finds the EPS note', () => {
    const window = locateStatements([
      contents,
      prose,
      incomeFace,
      balanceFace,
      cashflowFace,
      prose,
      prose,
      epsNote
    ]);
    expect(window).toEqual({ from: 3, to: 5, epsNotePage: 8 });
  });

  it('returns undefined when no statements exist', () => {
    expect(locateStatements([contents, prose, prose])).toBeUndefined();
  });

  it('passes over a basic-only EPS table for the diluted one', () => {
    const basicOnlyNote = [
      'Weighted average number of ordinary shares used in basic earnings per share  |  65,438,099'
    ];
    const window = locateStatements([
      incomeFace,
      balanceFace,
      cashflowFace,
      basicOnlyNote,
      epsNote
    ]);
    expect(window).toEqual({ from: 1, to: 3, epsNotePage: 5 });
  });

  it('rejects a window that never reaches all three statements', () => {
    expect(locateStatements([incomeFace, balanceFace, [], [], cashflowFace])).toBeUndefined();
  });

  it('tolerates one dead page inside the run', () => {
    const window = locateStatements([incomeFace, [], balanceFace, cashflowFace]);
    expect(window).toMatchObject({ from: 1, to: 4 });
  });

  it('caps the window at twelve pages', () => {
    const faces = [incomeFace, balanceFace, cashflowFace];
    const pages = Array.from({ length: 15 }, (_, index) => faces[index % 3]!);
    expect(locateStatements(pages)).toMatchObject({ from: 1, to: 12 });
  });

  it('records an EPS note that sits inside the window itself', () => {
    const faceWithEps = [
      ...incomeFace,
      'Weighted average number of ordinary shares (diluted)  |  109.8'
    ];
    expect(locateStatements([faceWithEps, balanceFace, cashflowFace])).toEqual({
      from: 1,
      to: 3,
      epsNotePage: 1
    });
  });

  it('keeps the window open across a changes-in-equity grid with no statement title', () => {
    const equityGrid = ['Attributable to equity holders', 'Total equity', numbersRow()];
    const window = locateStatements([incomeFace, balanceFace, equityGrid, cashflowFace]);
    expect(window).toMatchObject({ from: 1, to: 4 });
  });

  it('extends backward onto faces before a balance-sheet anchor', () => {
    // CSL titles its profit and loss a comprehensive-income statement; when
    // a title evades the heading test, the balance sheet anchors and the
    // income pages join backward on their statutory dressing.
    const proseTitledIncome = [
      'Here follows the consolidated statement of comprehensive income for the year ended 30 June 2025 of the Group.',
      'Gross profit  |  1,727.9  |  1,673.5',
      'Profit before income tax  |  518.5  |  484.8',
      numbersRow(),
      CONJUNCTION_FOOTER
    ];
    const window = locateStatements([proseTitledIncome, balanceFace, cashflowFace]);
    expect(window).toMatchObject({ from: 1, to: 3 });
  });

  it('never drags the financial report contents page in backward', () => {
    // A financial-report ToC is maximally face-like (headings, note-number
    // tokens) but wears no period subtitle and no conjunction footer.
    const financialToc = [
      'Financial Report',
      'Consolidated Statement of Profit or Loss  |  78',
      'Consolidated Statement of Financial Position  |  80',
      'Consolidated Statement of Cash Flows  |  82',
      'Earnings per share  |  113',
      numbersRow()
    ];
    const window = locateStatements([financialToc, incomeFace, balanceFace, cashflowFace]);
    expect(window).toMatchObject({ from: 2, to: 4 });
  });

  it('accepts a set wearing only period subtitles, the Wesfarmers shape', () => {
    const stripConjunction = (face: readonly string[]) =>
      face.filter((line) => !line.includes('read in conjunction'));
    const window = locateStatements([
      stripConjunction(incomeFace),
      stripConjunction(balanceFace),
      stripConjunction(cashflowFace)
    ]);
    expect(window).toMatchObject({ from: 1, to: 3 });
  });

  it('reads a title broken across two narrow-column lines as a heading', () => {
    const splitTitleFace = [
      'CONSOLIDATED STATEMENT',
      'OF COMPREHENSIVE INCOME',
      'for the year ended 30 June 2017',
      'Gross profit  |  3,596.0',
      'Profit before income tax  |  1,689.8',
      numbersRow(),
      CONJUNCTION_FOOTER
    ];
    const window = locateStatements([splitTitleFace, balanceFace, cashflowFace]);
    expect(window).toMatchObject({ from: 1, to: 3 });
  });
});

describe('pageSignals', () => {
  it('reads the marker set off a page', () => {
    const signals = pageSignals(incomeFace);
    expect(signals.heading).toBe(true);
    expect(signals.strongIncome).toBe(true);
    expect(signals.strongBalance).toBe(false);
    expect(signals.strongCashflow).toBe(false);
    expect(signals.conjunction).toBe(true);
    expect(signals.periodPhrase).toBe(true);
    expect(signals.weakCount).toBeGreaterThanOrEqual(2);
    expect(signals.numberTokens).toBeGreaterThanOrEqual(25);
    expect(signals.chars).toBeGreaterThan(0);
  });
});
