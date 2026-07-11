/**
 * Text-to-storage conversion for the entry grid (money policy, data-model
 * spec §4): what the user types is in the year's entry scale; storage is
 * integer minor units. The rules here guarantee no accepted input is ever
 * rounded: decimals are capped where they stay exact in minor units, and
 * arithmetic runs through BigInt so nothing drifts through floats.
 *
 * Display is the mirror: exact division with as many decimals as the stored
 * amount needs, so a value entered at a finer scale than the year now shows
 * still reads true.
 */
import { scaleUnitMinor, type LineItemId, type Scale } from '@plainsight/calc-engine';

export type EntryUnit = 'money' | 'count';

/**
 * Diluted shares store a plain count in ones (the engine's EntryValue
 * convention); every other item is money in minor units.
 */
const COUNT_ITEMS: ReadonlySet<LineItemId> = new Set(['dilutedShares']);

export const unitOf = (id: LineItemId): EntryUnit => (COUNT_ITEMS.has(id) ? 'count' : 'money');

/** Stored units per 1 typed unit at the scale. */
export function minorPerUnit(scale: Scale, unit: EntryUnit): number {
  const money = scaleUnitMinor(scale);
  return unit === 'money' ? money : money / 100;
}

/** Most decimal places at which every input is exact in stored units. */
export function maxDecimals(scale: Scale, unit: EntryUnit): number {
  return Math.min(2, Math.round(Math.log10(minorPerUnit(scale, unit))));
}

export interface EntryFormat {
  scale: Scale;
  unit: EntryUnit;
  signed: boolean;
}

export type ParsedEntry = { ok: true; minor: number | null } | { ok: false };

const DIGITS = /^\d*$/;

/**
 * Parses committed text to stored units. Empty (or a lone minus) is the
 * unknown state, never zero. Anything unrepresentable exactly, out of safe
 * range, or negative on an unsigned item refuses to parse.
 */
export function parseEntryText(text: string, format: EntryFormat): ParsedEntry {
  const bare = text.replaceAll(',', '').trim();
  if (bare === '' || bare === '-') return { ok: true, minor: null };
  const negative = bare.startsWith('-');
  if (negative && !format.signed) return { ok: false };
  const magnitude = negative ? bare.slice(1) : bare;
  const parts = magnitude.split('.');
  if (parts.length > 2) return { ok: false };
  const whole = parts[0] ?? '';
  const frac = parts[1] ?? '';
  if (!DIGITS.test(whole) || !DIGITS.test(frac)) return { ok: false };
  if (whole === '' && frac === '') return { ok: false };
  if (frac.length > maxDecimals(format.scale, format.unit)) return { ok: false };

  const per = minorPerUnit(format.scale, format.unit);
  const wholeMinor = BigInt(whole === '' ? '0' : whole) * BigInt(per);
  const fracMinor = frac === '' ? 0n : BigInt(frac) * BigInt(per / 10 ** frac.length);
  const total = negative ? -(wholeMinor + fracMinor) : wholeMinor + fracMinor;
  const minor = Number(total);
  if (!Number.isSafeInteger(minor) || BigInt(minor) !== total) return { ok: false };
  return { ok: true, minor };
}

const withSeparators = (whole: string): string =>
  whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Exact display of a stored amount in the given scale, separators included. */
export function formatEntryText(minor: number, format: { scale: Scale; unit: EntryUnit }): string {
  const per = BigInt(minorPerUnit(format.scale, format.unit));
  const negative = minor < 0;
  const abs = BigInt(Math.abs(minor));
  const whole = abs / per;
  const remainder = abs % per;
  const sign = negative ? '-' : '';
  if (remainder === 0n) return `${sign}${withSeparators(whole.toString())}`;
  const width = per.toString().length - 1;
  const decimals = remainder.toString().padStart(width, '0').replace(/0+$/, '');
  return `${sign}${withSeparators(whole.toString())}.${decimals}`;
}

/**
 * Accepts in-progress text, partial states included ('', '-', '12.').
 * Separators are ignored wherever they sit; reformatTyping canonicalises them.
 */
export function isValidTyping(raw: string, format: EntryFormat): boolean {
  const bare = raw.replaceAll(',', '');
  const pattern = format.signed ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!pattern.test(bare)) return false;
  const frac = bare.split('.')[1];
  return frac === undefined || frac.length <= maxDecimals(format.scale, format.unit);
}

/** Canonical separators for the whole part; sign, decimal point and partial states untouched. */
export function reformatTyping(raw: string): string {
  const bare = raw.replaceAll(',', '');
  const negative = bare.startsWith('-');
  const magnitude = negative ? bare.slice(1) : bare;
  const dot = magnitude.indexOf('.');
  const whole = dot === -1 ? magnitude : magnitude.slice(0, dot);
  const rest = dot === -1 ? '' : magnitude.slice(dot);
  return `${negative ? '-' : ''}${withSeparators(whole)}${rest}`;
}

/** Keeps the caret with its digit across a reformat: same count of non-separator characters before it. */
export function caretAfterReformat(raw: string, caret: number, formatted: string): number {
  const significantBefore = raw.slice(0, caret).replaceAll(',', '').length;
  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < significantBefore) {
    if (formatted[position] !== ',') seen += 1;
    position += 1;
  }
  return position;
}
