/**
 * Display formatting: the separate, final step (P-1). Precision is pinned by
 * P-2: percentages 1 dp; ratios 2 dp; coverage 1 dp with the multiplication
 * sign; money compact to 3 significant figures with a currency symbol.
 * Not-meaningful phrases are pinned by P-5. Never blank, never 0, never NaN.
 *
 * House style: negative numbers render with the true minus (U+2212).
 */
import type { CurrencyCode, MetricValue, NotMeaningfulReason } from './types.js';

export const NOT_MEANINGFUL_PHRASES: Readonly<Record<NotMeaningfulReason, string>> = {
  negative_equity: 'n/m: negative equity',
  negative_earnings: 'n/m: negative earnings',
  negative_invested_capital: 'n/m: negative invested capital',
  no_interest_expense: 'n/m: no interest burden',
  zero_revenue: 'n/m: no revenue',
  zero_denominator: 'n/m: zero denominator',
  // P-5 routes no_price to the enter-price card, not to a metric phrase; this
  // string is a defensive fallback so the formatter is total and can never
  // surface a blank.
  no_price: 'n/m: no price'
};

const TRUE_MINUS = '−';

/** toFixed, with a true minus and negative zero normalised away. */
function fixed(value: number, dp: number): string {
  let text = value.toFixed(dp);
  if (Number(text) === 0) {
    // -0.04 at 1 dp is '-0.0'; a signed zero is noise, not information.
    text = (0).toFixed(dp);
  }
  return text.startsWith('-') ? TRUE_MINUS + text.slice(1) : text;
}

/** Percentages at 1 dp: 0.462 -> '46.2%'. */
export function formatPercent(fraction: number): string {
  return `${fixed(fraction * 100, 1)}%`;
}

/** Ratios at 2 dp: 1.8666 -> '1.87'. */
export function formatRatio(value: number): string {
  return fixed(value, 2);
}

/** Coverage at 1 dp with the multiplication sign: 29.06 -> '29.1×'. */
export function formatCoverage(value: number): string {
  return `${fixed(value, 1)}×`;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  AUD: '$'
};

interface CompactPart {
  divisor: number;
  suffix: string;
}

const COMPACT_PARTS: readonly CompactPart[] = [
  { divisor: 1e12, suffix: 't' },
  { divisor: 1e9, suffix: 'b' },
  { divisor: 1e6, suffix: 'm' },
  { divisor: 1e3, suffix: 'k' }
];

/**
 * Money compact to 3 significant figures with a currency symbol:
 * 9_650_000_000_00 minor USD -> '$9.65b'. Sub-thousand amounts render plain.
 *
 * The magnitude is chosen AFTER rounding to 3 significant figures, so a value
 * like $999.50k prints as '$1.00m' rather than a four-digit '$1000k' or a
 * float-drifted '$0.999m'.
 */
export function formatMoneyMinor(amountMinor: number, currency: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const major = amountMinor / 100;
  const abs = Math.abs(major);
  if (abs === 0) {
    return `${symbol}0`;
  }
  const sign = major < 0 ? TRUE_MINUS : '';

  const rounded = Number(abs.toPrecision(3));
  let scaled = rounded;
  let suffix = '';
  for (const part of COMPACT_PARTS) {
    if (rounded >= part.divisor) {
      scaled = rounded / part.divisor;
      suffix = part.suffix;
      break;
    }
  }
  if (scaled >= 1000) {
    // Beyond the largest suffix (only reachable past the trillions, outside
    // asserted storage amounts); fall back to whole trillions so the formatter
    // stays total and exponent-free.
    return `${sign}${symbol}${Math.round(scaled)}t`;
  }
  return `${sign}${symbol}${scaled.toPrecision(3)}${suffix}`;
}

export type DisplayKind = 'percent' | 'ratio' | 'coverage' | 'money';

/**
 * Total formatting of a MetricValue for display and for golden-file
 * comparison. `insufficient_data` has screen-specific copy in the UI ("Add the
 * 2 missing numbers"); the generic phrase here keeps the function total.
 */
export function formatMetricValue(
  value: MetricValue,
  kind: DisplayKind,
  currency: CurrencyCode
): string {
  switch (value.status) {
    case 'not_meaningful':
      return NOT_MEANINGFUL_PHRASES[value.reason];
    case 'insufficient_data':
      return 'insufficient data';
    case 'ok':
      switch (kind) {
        case 'percent':
          return formatPercent(value.value);
        case 'ratio':
          return formatRatio(value.value);
        case 'coverage':
          return formatCoverage(value.value);
        case 'money':
          return formatMoneyMinor(value.value, currency);
      }
  }
}
