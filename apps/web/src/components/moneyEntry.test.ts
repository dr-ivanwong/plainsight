import { describe, expect, it } from 'vitest';

import {
  caretAfterReformat,
  formatEntryText,
  isValidTyping,
  maxDecimals,
  minorPerUnit,
  parseEntryText,
  reformatTyping,
  unitOf
} from './moneyEntry';

const money = { scale: 'millions', unit: 'money', signed: false } as const;
const signedMoney = { ...money, signed: true } as const;

describe('units', () => {
  it('treats diluted shares as a count and everything else as money', () => {
    expect(unitOf('dilutedShares')).toBe('count');
    expect(unitOf('revenue')).toBe('money');
    expect(unitOf('capex')).toBe('money');
  });

  it('converts by scale, with counts stored in ones', () => {
    expect(minorPerUnit('ones', 'money')).toBe(100);
    expect(minorPerUnit('millions', 'money')).toBe(100_000_000);
    expect(minorPerUnit('ones', 'count')).toBe(1);
    expect(minorPerUnit('millions', 'count')).toBe(1_000_000);
  });

  it('caps decimals where storage stays exact', () => {
    expect(maxDecimals('ones', 'money')).toBe(2);
    expect(maxDecimals('billions', 'money')).toBe(2);
    expect(maxDecimals('ones', 'count')).toBe(0);
    expect(maxDecimals('thousands', 'count')).toBe(2);
  });
});

describe('parseEntryText', () => {
  it('parses separators and decimals exactly at scale', () => {
    expect(parseEntryText('391,035', money)).toEqual({ ok: true, minor: 39_103_500_000_000 });
    expect(parseEntryText('1,234.5', money)).toEqual({ ok: true, minor: 123_450_000_000 });
    expect(parseEntryText('.5', { ...money, scale: 'ones' })).toEqual({ ok: true, minor: 50 });
    expect(parseEntryText('12', { scale: 'ones', unit: 'count', signed: false })).toEqual({
      ok: true,
      minor: 12
    });
  });

  it('reads empty and a lone minus as the unknown state', () => {
    expect(parseEntryText('', money)).toEqual({ ok: true, minor: null });
    expect(parseEntryText('  ', money)).toEqual({ ok: true, minor: null });
    expect(parseEntryText('-', signedMoney)).toEqual({ ok: true, minor: null });
  });

  it('honours the sign rules', () => {
    expect(parseEntryText('-500', signedMoney)).toEqual({ ok: true, minor: -50_000_000_000 });
    expect(parseEntryText('-500', money)).toEqual({ ok: false });
  });

  it('refuses what cannot be stored exactly or safely', () => {
    expect(parseEntryText('1.234', money)).toEqual({ ok: false });
    expect(parseEntryText('0.5', { scale: 'ones', unit: 'count', signed: false })).toEqual({
      ok: false
    });
    expect(parseEntryText('99,999,999,999,999,999', money)).toEqual({ ok: false });
    expect(parseEntryText('abc', money)).toEqual({ ok: false });
    expect(parseEntryText('1.2.3', money)).toEqual({ ok: false });
    expect(parseEntryText('.', money)).toEqual({ ok: false });
  });
});

describe('formatEntryText', () => {
  it('formats whole and fractional amounts with separators', () => {
    expect(formatEntryText(39_103_500_000_000, money)).toBe('391,035');
    expect(formatEntryText(123_450_000_000, money)).toBe('1,234.5');
    expect(formatEntryText(-50, { scale: 'ones', unit: 'money' })).toBe('-0.5');
    expect(formatEntryText(12, { scale: 'ones', unit: 'count' })).toBe('12');
    expect(formatEntryText(15_408_095_000, { scale: 'millions', unit: 'count' })).toBe(
      '15,408.095'
    );
  });

  it('shows deep decimals exactly when the stored amount is finer than the scale', () => {
    expect(formatEntryText(50_000, money)).toBe('0.0005');
  });

  it('round-trips every value enterable at the scale', () => {
    const samples = [0, 100_000_000, 5_000_000, -250_000_000, 39_103_500_000_000, 123_450_000_000];
    for (const minor of samples) {
      const text = formatEntryText(minor, { scale: 'millions', unit: 'money' });
      expect(parseEntryText(text, { ...signedMoney })).toEqual({ ok: true, minor });
    }
  });
});

describe('typing helpers', () => {
  it('accepts partial states and rejects malformed keystrokes', () => {
    expect(isValidTyping('', money)).toBe(true);
    expect(isValidTyping('12.', money)).toBe(true);
    expect(isValidTyping('1,2', money)).toBe(true);
    expect(isValidTyping('-', signedMoney)).toBe(true);
    expect(isValidTyping('-', money)).toBe(false);
    expect(isValidTyping('x', money)).toBe(false);
    expect(isValidTyping('1.2.3', money)).toBe(false);
    expect(isValidTyping('1.234', money)).toBe(false);
  });

  it('canonicalises separators as the text grows', () => {
    expect(reformatTyping('1234')).toBe('1,234');
    expect(reformatTyping('1234567.8')).toBe('1,234,567.8');
    expect(reformatTyping('-1234567')).toBe('-1,234,567');
    expect(reformatTyping('12.')).toBe('12.');
  });

  it('keeps the caret with its digit when separators shift', () => {
    expect(caretAfterReformat('1234', 4, '1,234')).toBe(5);
    expect(caretAfterReformat('19,234,567', 2, '19,234,567')).toBe(2);
    expect(caretAfterReformat('12345', 3, '12,345')).toBe(4);
    expect(caretAfterReformat('1,2345', 6, '12,345')).toBe(6);
  });
});
