// The detail sheet's arithmetic must reproduce the displayed value by hand
// (main plan section 13): these tests evaluate every substituted equation and
// every derived-figure row the sheet emits, against the engine's own result,
// on both denominator bases (data-model section 4).
import {
  computeMetric,
  formatMoneyMinor,
  METRIC_IDS,
  type EntryValue,
  type FyLabel,
  type LineItemId,
  type MetricValue,
  type PriceRecord,
  type StatementYear
} from '@plainsight/calc-engine';
import { describe, expect, it } from 'vitest';

import { formatEntryText, unitOf } from '../../components/moneyEntry';
import { deriveSheetFigures, type ResolveAmount } from './sheetDerivation';

const PRICE: PriceRecord = { amountMinor: 30, currency: 'USD', asOf: '2026-07-10' };

const FY2024: Readonly<Record<string, number>> = {
  revenue: 100_000,
  costOfRevenue: 60_000,
  grossProfit: 40_000,
  operatingIncome: 20_000,
  interestExpense: 1_000,
  pretaxIncome: 19_000,
  taxExpense: 4_000,
  netIncome: 15_000,
  dilutedShares: 10_000,
  cashAndEquivalents: 5_000,
  currentAssets: 30_000,
  totalAssets: 100_000,
  currentLiabilities: 15_000,
  shortTermDebt: 2_000,
  longTermDebt: 18_000,
  totalLiabilities: 60_000,
  totalEquity: 40_000,
  operatingCashFlow: 18_000,
  capex: 6_000
};

const FY2023: Readonly<Record<string, number>> = {
  ...FY2024,
  totalEquity: 36_000,
  cashAndEquivalents: 9_000
};

const entered = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

function engineYear(fy: FyLabel, raw: Readonly<Record<string, number>>): StatementYear {
  const values: Partial<Record<LineItemId, EntryValue>> = {};
  for (const [id, minor] of Object.entries(raw)) {
    values[id as LineItemId] = entered(minor);
  }
  return { fy, endDate: '2024-09-28', currency: 'USD', entryScale: 'ones', values };
}

const resolveFrom =
  (byFy: Readonly<Record<string, Readonly<Record<string, number>> | undefined>>): ResolveAmount =>
  (itemId, fy) =>
    byFy[fy]?.[itemId] ?? null;

const amountText = (itemId: LineItemId, amountMinor: number): string =>
  unitOf(itemId) === 'money'
    ? formatMoneyMinor(amountMinor, 'USD')
    : formatEntryText(amountMinor, { scale: 'ones', unit: 'count' });

function derive(metricId: (typeof METRIC_IDS)[number], latest: MetricValue, withPrior: boolean) {
  return deriveSheetFigures({
    metricId,
    latest,
    latestFy: 'FY2024',
    currency: 'USD',
    resolve: resolveFrom(withPrior ? { FY2024, FY2023 } : { FY2024 }),
    amountText,
    priceText: formatMoneyMinor(PRICE.amountMinor, PRICE.currency)
  });
}

// A tiny evaluator for the sheet's emitted grammar: money ('$', k/m/b/t
// suffixes, true-minus negatives), plain counts with separators, percents,
// the four operators, and parentheses.
const SUFFIX: Readonly<Record<string, number>> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

function readNumber(text: string, start: number): { value: number; end: number } {
  let i = start;
  if (text[i] === '$') i += 1;
  let digits = '';
  while (i < text.length) {
    const ch = text[i] as string;
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      digits += ch;
      i += 1;
      continue;
    }
    if (ch === ',') {
      i += 1;
      continue;
    }
    break;
  }
  let value = Number(digits);
  const suffix = text[i];
  if (suffix !== undefined && SUFFIX[suffix] !== undefined) {
    value *= SUFFIX[suffix] as number;
    i += 1;
  }
  if (text[i] === '%') {
    value /= 100;
    i += 1;
  }
  return { value, end: i };
}

function tokenise(text: string): (number | string)[] {
  const tokens: (number | string)[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === ' ') {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '+' || ch === '×' || ch === '÷') {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === '−') {
      const following = text[i + 1];
      if (following === '$' || (following !== undefined && following >= '0' && following <= '9')) {
        const parsed = readNumber(text, i + 1);
        tokens.push(-parsed.value);
        i = parsed.end;
      } else {
        tokens.push('−');
        i += 1;
      }
      continue;
    }
    if (ch === '$' || (ch >= '0' && ch <= '9')) {
      const parsed = readNumber(text, i);
      tokens.push(parsed.value);
      i = parsed.end;
      continue;
    }
    throw new Error(`Unreadable character '${ch}' in '${text}'`);
  }
  return tokens;
}

function evaluateArithmetic(text: string): number {
  const tokens = tokenise(text);
  let pos = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (tokens[pos] === '+' || tokens[pos] === '−') {
      const op = tokens[pos];
      pos += 1;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (tokens[pos] === '×' || tokens[pos] === '÷') {
      const op = tokens[pos];
      pos += 1;
      const right = parseFactor();
      left = op === '×' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    const token = tokens[pos];
    pos += 1;
    if (token === '(') {
      const value = parseExpression();
      if (tokens[pos] !== ')') throw new Error(`Unbalanced parentheses in '${text}'`);
      pos += 1;
      return value;
    }
    if (typeof token === 'number') return token;
    throw new Error(`Unexpected token '${String(token)}' in '${text}'`);
  }

  const value = parseExpression();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in '${text}'`);
  return value;
}

function parseDisplayedValue(text: string): number {
  const unscaled = text.endsWith('×') ? text.slice(0, -1) : text;
  const negative = unscaled.startsWith('−');
  const body = negative ? unscaled.slice(1) : unscaled;
  const { value, end } = readNumber(body, 0);
  if (end !== body.length) throw new Error(`Unreadable displayed value '${text}'`);
  return negative ? -value : value;
}

/** Asserts an emitted 'lhs = rhs' line holds within display rounding. */
function expectEquationHolds(line: string): void {
  const at = line.lastIndexOf(' = ');
  expect(at, `no equation in '${line}'`).toBeGreaterThan(0);
  const evaluated = evaluateArithmetic(line.slice(0, at));
  const displayed = parseDisplayedValue(line.slice(at + 3));
  const tolerance = Math.max(0.02 * Math.max(Math.abs(evaluated), Math.abs(displayed)), 0.0015);
  expect(Math.abs(evaluated - displayed), `'${line}' does not hold`).toBeLessThanOrEqual(tolerance);
}

describe('every substituted equation reproduces the displayed value', () => {
  for (const withPrior of [false, true]) {
    const basisName = withPrior ? 'averaged basis' : 'ending basis';
    it(`holds for all 14 metrics (${basisName})`, () => {
      const year = engineYear('FY2024', FY2024);
      const prior = withPrior ? engineYear('FY2023', FY2023) : undefined;
      for (const metricId of METRIC_IDS) {
        const latest = computeMetric(metricId, { year, prior, price: PRICE });
        expect(latest.status, `${metricId} should compute on the full fixture`).toBe('ok');

        const derivation = derive(metricId, latest, withPrior);
        expect(derivation.substituted, `${metricId} substitution should resolve`).not.toBeNull();
        expectEquationHolds(derivation.substituted as string);
        for (const row of derivation.derivedRows) {
          if (row.text.includes(' = ')) expectEquationHolds(row.text);
        }

        const averaged = latest.status === 'ok' && latest.basis === 'average';
        expect(derivation.priorFy).toBe(averaged ? 'FY2023' : null);
        if (metricId === 'roe' && averaged) {
          expect(derivation.priorInputs).toEqual(['totalEquity']);
        }
      }
    });
  }
});

describe('the averaged ROE sheet (data-model section 4)', () => {
  it('substitutes the average actually divided by and proves it in a row', () => {
    const year = engineYear('FY2024', FY2024);
    const prior = engineYear('FY2023', FY2023);
    const latest = computeMetric('roe', { year, prior, price: undefined });

    const derivation = derive('roe', latest, true);
    expect(derivation.humanisedFormula).toBe('net income ÷ average total equity');
    expect(derivation.substituted).toBe('$150 ÷ $380 = 39.5%');
    expect(derivation.priorFy).toBe('FY2023');
    expect(derivation.derivedRows).toEqual([
      {
        id: 'averageTotalEquity',
        label: 'Average total equity',
        text: '($400 + $360) ÷ 2 = $380'
      }
    ]);
  });
});

describe('the ROIC sheet states the pinned intermediates (data-model section 6)', () => {
  it('derives the tax rate, NOPAT, and invested capital on the ending basis', () => {
    const year = engineYear('FY2024', FY2024);
    const latest = computeMetric('roic', { year, prior: undefined, price: undefined });

    const derivation = derive('roic', latest, false);
    expect(derivation.substituted).toBe('$158 ÷ $550 = 28.7%');
    expect(derivation.derivedRows).toEqual([
      { id: 'effectiveTaxRate', label: 'Effective tax rate', text: '$40.0 ÷ $190 = 21.1%' },
      { id: 'nopat', label: 'NOPAT', text: '$200 × (1 − 21.1%) = $158' },
      {
        id: 'investedCapitalClosing',
        label: 'Invested capital, FY2024',
        text: '$20.0 + $180 + $400 − $50.0 = $550'
      }
    ]);
  });

  it('averages invested capital across the two years it read', () => {
    const year = engineYear('FY2024', FY2024);
    const prior = engineYear('FY2023', FY2023);
    const latest = computeMetric('roic', { year, prior, price: undefined });

    const derivation = derive('roic', latest, true);
    expect(derivation.humanisedFormula).toBe('NOPAT ÷ average invested capital');
    expect(derivation.substituted).toBe('$158 ÷ $510 = 31.0%');
    expect(derivation.priorInputs).toEqual([
      'shortTermDebt',
      'longTermDebt',
      'totalEquity',
      'cashAndEquivalents'
    ]);
    const labels = derivation.derivedRows.map((row) => row.label);
    expect(labels).toEqual([
      'Effective tax rate',
      'NOPAT',
      'Invested capital, FY2024',
      'Invested capital, FY2023',
      'Average invested capital'
    ]);
    expect(derivation.derivedRows.at(-1)?.text).toBe('($550 + $470) ÷ 2 = $510');
  });

  it('speaks the clamp honestly when it bites', () => {
    const charged = { ...FY2024, taxExpense: 12_000 };
    const year = engineYear('FY2024', charged);
    const latest = computeMetric('roic', { year, prior: undefined, price: undefined });

    const derivation = deriveSheetFigures({
      metricId: 'roic',
      latest,
      latestFy: 'FY2024',
      currency: 'USD',
      resolve: resolveFrom({ FY2024: charged }),
      amountText,
      priceText: null
    });
    expect(derivation.derivedRows[0]?.text).toBe('$120 ÷ $190, clamped to 45.0%');
    expect(derivation.substituted).toBe('$110 ÷ $550 = 20.0%');
  });

  it('takes the rate as zero below the line, and says so', () => {
    const lossYear = { ...FY2024, pretaxIncome: -1_000 };
    const year = engineYear('FY2024', lossYear);
    const latest = computeMetric('roic', { year, prior: undefined, price: undefined });

    const derivation = deriveSheetFigures({
      metricId: 'roic',
      latest,
      latestFy: 'FY2024',
      currency: 'USD',
      resolve: resolveFrom({ FY2024: lossYear }),
      amountText,
      priceText: null
    });
    expect(derivation.derivedRows[0]?.text).toBe('0% (pretax income at or below zero)');
    expect(derivation.derivedRows[1]?.text).toBe('$200 × (1 − 0.0%) = $200');
    expect(derivation.substituted).toBe('$200 ÷ $550 = 36.4%');
  });
});

describe('the FCF shorthand proves its own numerator (data-model section 6)', () => {
  it('substitutes the derived figure and states its arithmetic', () => {
    const year = engineYear('FY2024', FY2024);
    const latest = computeMetric('fcfConversion', { year, prior: undefined, price: undefined });

    const derivation = derive('fcfConversion', latest, false);
    expect(derivation.substituted).toBe('$120 ÷ $150 = 80.0%');
    expect(derivation.derivedRows).toEqual([
      { id: 'freeCashFlow', label: 'Free cash flow', text: '$180 − $60.0 = $120' }
    ]);
  });
});

describe('no equation is better than a wrong one', () => {
  it('withholds the substituted line when an operand is unknown', () => {
    const latest: MetricValue = { status: 'ok', value: 0.375, basis: 'ending' };
    const derivation = deriveSheetFigures({
      metricId: 'roe',
      latest,
      latestFy: 'FY2024',
      currency: 'USD',
      resolve: () => null,
      amountText,
      priceText: null
    });
    expect(derivation.substituted).toBeNull();
    expect(derivation.derivedRows).toEqual([]);
  });

  it('withholds the average when the prior year cannot be resolved', () => {
    const latest: MetricValue = { status: 'ok', value: 0.395, basis: 'average' };
    const derivation = deriveSheetFigures({
      metricId: 'roe',
      latest,
      latestFy: 'FY2024',
      currency: 'USD',
      resolve: resolveFrom({ FY2024 }),
      amountText,
      priceText: null
    });
    expect(derivation.substituted).toBeNull();
    expect(derivation.derivedRows).toEqual([]);
    expect(derivation.priorInputs).toEqual(['totalEquity']);
  });

  it('offers only the worded formula when the metric did not compute', () => {
    const derivation = deriveSheetFigures({
      metricId: 'roe',
      latest: { status: 'not_meaningful', reason: 'negative_equity' },
      latestFy: 'FY2024',
      currency: 'USD',
      resolve: resolveFrom({ FY2024 }),
      amountText,
      priceText: null
    });
    expect(derivation.humanisedFormula).toBe('net income ÷ total equity');
    expect(derivation.substituted).toBeNull();
  });
});
