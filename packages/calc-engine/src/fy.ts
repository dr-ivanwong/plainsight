/**
 * Fiscal calendar helpers (the fiscal-calendar policy, data-model section 4):
 * the FY label is the calendar year containing the year-end date. CSL's year
 * ending 2025-06-30 is FY2025. Trends, deltas, and comparisons align by label;
 * nothing is pro-rated.
 */
import type { FyLabel } from './types.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in each month; February is checked separately for leap years. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Parses an ISO `YYYY-MM-DD` date, throwing on anything else. The engine
 * asserts its boundaries (spec section 3); the client validates with Zod before
 * data ever reaches storage, so a throw here is a programming error upstream.
 */
export function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(date);
  if (!match) {
    throw new RangeError(`Invalid ISO date: expected YYYY-MM-DD, got '${date}'`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new RangeError(`Invalid ISO date '${date}': month out of range`);
  }
  // The month bound check above keeps this index in range.
  const maxDay = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
  if (day < 1 || day > maxDay) {
    throw new RangeError(`Invalid ISO date '${date}': day out of range`);
  }
  return { year, month, day };
}

/** FY label = the calendar year containing the year-end date. */
export function fyLabelFromEndDate(endDate: string): FyLabel {
  const { year } = parseIsoDate(endDate);
  return `FY${year}`;
}

const FY_LABEL = /^FY(\d{4})$/;

/** Type guard for the pinned label format; client boundaries build their validators from it. */
export function isFyLabel(value: string): value is FyLabel {
  return FY_LABEL.test(value);
}

/** The numeric year of a label. Throws on malformed labels (boundary assert). */
export function fyYear(label: FyLabel): number {
  const match = FY_LABEL.exec(label);
  if (!match) {
    throw new RangeError(`Invalid FY label: expected FY<year>, got '${label}'`);
  }
  return Number(match[1]);
}

export function fyLabelOf(year: number): FyLabel {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError(`Invalid fiscal year: ${year}`);
  }
  return `FY${year}`;
}

/** Ascending label sort for report assembly. */
export function compareFyLabels(a: FyLabel, b: FyLabel): number {
  return fyYear(a) - fyYear(b);
}
