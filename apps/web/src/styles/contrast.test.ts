/**
 * CI-enforced contrast checks on the token palette (main plan §4: WCAG AA
 * verified mechanically, not by eye). Runs in a plain Node environment and
 * imports palette.ts directly, so no Vanilla Extract processing is involved.
 *
 * The luminance and contrast maths below implement the WCAG 2.x definitions
 * from scratch, deliberately without a dependency. The sRGB linearisation
 * threshold is WCAG's published 0.03928; the 0.04045 variant gives identical
 * results for 8-bit channels, since no integer channel value falls between
 * the two.
 */
import { describe, expect, it } from 'vitest';

import { darkPalette, lightPalette, type ThemePalette } from './palette';

function channelToLinear(channel8: number): number {
  const c = channel8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (match === null || match[1] === undefined) {
    throw new Error(`Expected a six-digit hex colour, got "${hex}"`);
  }
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Backgrounds that text and semantic colours actually render on. */
const renderedBackgrounds = ['background', 'surface', 'surfaceElevated'] as const;

/** Returns the rendered backgrounds on which `foreground` misses `minimum`. */
function contrastShortfalls(
  foreground: string,
  palette: ThemePalette,
  minimum: number,
): Array<{ on: string; ratio: number }> {
  return renderedBackgrounds
    .map((key) => ({
      on: key,
      ratio: Math.round(contrastRatio(foreground, palette[key]) * 100) / 100,
    }))
    .filter((entry) => entry.ratio < minimum);
}

describe('contrast implementation', () => {
  it('matches the WCAG anchor values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 4);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 4);
    // The classic borderline AA grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 6);
  });
});

const themes = [
  ['light', lightPalette],
  ['dark', darkPalette],
] as const;

for (const [themeName, palette] of themes) {
  describe(`${themeName} palette`, () => {
    it('primary text reaches 4.5:1 on background and surfaces', () => {
      expect(contrastShortfalls(palette.textPrimary, palette, 4.5)).toEqual([]);
    });

    it('secondary text reaches 4.5:1 on background and surfaces', () => {
      expect(contrastShortfalls(palette.textSecondary, palette, 4.5)).toEqual([]);
    });

    it('accent as text reaches 3:1 on background and surface (large text and interactive)', () => {
      expect(contrastRatio(palette.accent, palette.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.accent, palette.surface)).toBeGreaterThanOrEqual(3);
    });

    it('each semantic health colour reaches 3:1 on its rendered backgrounds', () => {
      for (const semantic of ['healthy', 'investigate', 'flag'] as const) {
        expect(contrastShortfalls(palette[semantic], palette, 3), semantic).toEqual([]);
      }
    });

    it('the label on accent-filled controls reaches 4.5:1', () => {
      expect(contrastRatio(palette.onAccent, palette.accentFill)).toBeGreaterThanOrEqual(4.5);
    });
  });
}
