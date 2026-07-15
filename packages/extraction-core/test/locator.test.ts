import { describe, expect, it } from 'vitest';

import { locateStatements, pageSignals } from '../src/pdf/index.js';

/** A dense numbers row, the signature of a real statement grid. */
const numbersRow = () =>
  Array.from({ length: 30 }, (_, index) => `${(index + 1) * 137},${100 + index}.5`).join('  |  ');

const incomeFace = [
  'Income statement',
  'Revenue  |  2,343.1  |  2,235.6',
  'Gross profit  |  1,727.9  |  1,673.5',
  'Profit before income tax  |  518.5  |  484.8',
  numbersRow()
];
const balanceFace = [
  'Balance sheet',
  'Total current assets  |  1,416.8  |  1,452.1',
  'Total equity  |  1,950.3  |  1,840.5',
  numbersRow()
];
const cashflowFace = [
  'Statement of cash flows',
  'Net cash provided by operating activities  |  237.6  |  388.8',
  numbersRow()
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

  it('tolerates one dead page inside the run, but not two', () => {
    const withGap = locateStatements([incomeFace, [], balanceFace, [], [], cashflowFace]);
    expect(withGap).toMatchObject({ from: 1, to: 3 });
  });

  it('keeps the window open across a changes-in-equity grid with no statement title', () => {
    const equityGrid = ['Attributable to equity holders', 'Total equity', numbersRow()];
    const window = locateStatements([incomeFace, balanceFace, equityGrid, cashflowFace]);
    expect(window).toMatchObject({ from: 1, to: 4 });
  });

  it('caps the window at twelve pages', () => {
    const pages = Array.from({ length: 16 }, () => balanceFace);
    expect(locateStatements(pages)).toMatchObject({ from: 1, to: 12 });
  });

  it('records an EPS note that sits inside the window itself', () => {
    const faceWithEps = [...incomeFace, 'Weighted average number of ordinary shares  |  109.8'];
    expect(locateStatements([faceWithEps, balanceFace])).toEqual({
      from: 1,
      to: 2,
      epsNotePage: 1
    });
  });
});

describe('pageSignals', () => {
  it('reads the marker set off a page', () => {
    const signals = pageSignals(incomeFace);
    expect(signals.strongIncome).toBe(true);
    expect(signals.strongBalance).toBe(false);
    expect(signals.strongCashflow).toBe(false);
    expect(signals.weakCount).toBeGreaterThanOrEqual(2);
    expect(signals.numberTokens).toBeGreaterThanOrEqual(25);
    expect(signals.chars).toBeGreaterThan(0);
  });
});
