import { describe, expect, it } from 'vitest';
import {
  formatCoverage,
  formatMetricValue,
  formatMoneyMinor,
  formatPercent,
  formatRatio,
  NOT_MEANINGFUL_PHRASES
} from '../src/format.js';

const MINUS = '−';

describe('formatPercent (1 dp)', () => {
  it('formats fractions as percentages', () => {
    expect(formatPercent(0.462)).toBe('46.2%');
    expect(formatPercent(1.05)).toBe('105.0%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('uses the true minus for negatives', () => {
    expect(formatPercent(-0.123)).toBe(`${MINUS}12.3%`);
  });

  it('normalises negative zero away', () => {
    expect(formatPercent(-0.0004)).toBe('0.0%');
  });
});

describe('formatRatio (2 dp)', () => {
  it('rounds to two decimals', () => {
    expect(formatRatio(1.866)).toBe('1.87');
    expect(formatRatio(0.5)).toBe('0.50');
    expect(formatRatio(-0.256)).toBe(`${MINUS}0.26`);
  });
});

describe('formatCoverage (1 dp with the multiplication sign)', () => {
  it('formats coverage multiples', () => {
    expect(formatCoverage(29.06)).toBe('29.1×');
    expect(formatCoverage(-1.2)).toBe(`${MINUS}1.2×`);
  });
});

describe('formatMoneyMinor (compact, 3 significant figures)', () => {
  it('formats across magnitudes', () => {
    expect(formatMoneyMinor(0, 'USD')).toBe('$0');
    expect(formatMoneyMinor(950, 'USD')).toBe('$9.50');
    expect(formatMoneyMinor(91_200, 'USD')).toBe('$912');
    expect(formatMoneyMinor(123_456_00, 'USD')).toBe('$123k');
    expect(formatMoneyMinor(9_650_000_00, 'USD')).toBe('$9.65m');
    expect(formatMoneyMinor(96_500_000_000_00, 'USD')).toBe('$96.5b');
    expect(formatMoneyMinor(3_850_000_000_000_00, 'USD')).toBe('$3.85t');
  });

  it('promotes 999.5 and above to the next magnitude instead of printing four digits', () => {
    expect(formatMoneyMinor(99_950, 'USD')).toBe('$1.00k');
    expect(formatMoneyMinor(999_500_000_00, 'USD')).toBe('$1.00b');
    expect(formatMoneyMinor(99_940, 'USD')).toBe('$999');
  });

  it('falls back to whole trillions beyond the largest suffix', () => {
    // Not reachable from asserted storage amounts; the formatter is total anyway.
    expect(formatMoneyMinor(1e17, 'USD')).toBe('$1000t');
  });

  it('uses the true minus for negatives', () => {
    expect(formatMoneyMinor(-1_200_000_000_00, 'USD')).toBe(`${MINUS}$1.20b`);
  });

  it('falls back to the currency code when no symbol is mapped', () => {
    expect(formatMoneyMinor(9_650_000_00, 'EUR')).toBe('EUR 9.65m');
    expect(formatMoneyMinor(500, 'AUD')).toBe('$5.00');
  });
});

describe('P-5 phrases', () => {
  it('pins the exact copy', () => {
    expect(NOT_MEANINGFUL_PHRASES).toEqual({
      negative_equity: 'n/m: negative equity',
      negative_earnings: 'n/m: negative earnings',
      negative_invested_capital: 'n/m: negative invested capital',
      no_interest_expense: 'n/m: no interest burden',
      zero_revenue: 'n/m: no revenue',
      zero_denominator: 'n/m: zero denominator',
      no_price: 'n/m: no price'
    });
  });
});

describe('formatMetricValue is total', () => {
  it('renders ok values by display kind', () => {
    expect(formatMetricValue({ status: 'ok', value: 0.462 }, 'percent', 'USD')).toBe('46.2%');
    expect(formatMetricValue({ status: 'ok', value: 1.87 }, 'ratio', 'USD')).toBe('1.87');
    expect(formatMetricValue({ status: 'ok', value: 29.06 }, 'coverage', 'USD')).toBe('29.1×');
    expect(formatMetricValue({ status: 'ok', value: 9_650_000_00 }, 'money', 'USD')).toBe('$9.65m');
  });

  it('renders the pinned phrase for not-meaningful values', () => {
    expect(formatMetricValue({ status: 'not_meaningful', reason: 'negative_equity' }, 'percent', 'USD')).toBe(
      'n/m: negative equity'
    );
  });

  it('renders a generic phrase for insufficient data (the UI owns the real copy)', () => {
    expect(formatMetricValue({ status: 'insufficient_data', missing: ['revenue'] }, 'percent', 'USD')).toBe(
      'insufficient data'
    );
  });
});
