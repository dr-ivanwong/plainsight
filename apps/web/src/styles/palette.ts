/**
 * Raw colour values for both themes, as pure data.
 *
 * This module deliberately has no imports and no Vanilla Extract processing:
 * the CI contrast test (contrast.test.ts) imports it under plain Vitest in a
 * Node environment. Keep it data-only.
 *
 * Design rules (main plan §4):
 * - Near-monochrome neutrals; exactly one accent (the system-blue family).
 * - Semantic colours are reserved for meaning: green healthy, orange
 *   investigate, red flag. Never decoration.
 * - Dark is designed, not inverted: surfaces sit in the #1C1C1E elevated-grey
 *   family (never pure-black cards), and accent/semantic colours are
 *   re-derived for dark backgrounds (desaturated, higher luminance).
 *
 * Contrast contracts, enforced by contrast.test.ts in both themes:
 * - textPrimary and textSecondary reach 4.5:1 on background, surface, and
 *   surfaceElevated.
 * - accent reaches 3:1 on background and surface (large text and interactive
 *   elements).
 * - healthy, investigate, and flag reach 3:1 on background, surface, and
 *   surfaceElevated.
 * - onAccent reaches 4.5:1 on accentFill.
 */

export interface ThemePalette {
  /** App background behind everything. */
  background: string;
  /** Card and row surface. */
  surface: string;
  /** Raised surface: sheets and popovers. Light mode elevates with shadow instead, so it stays white. */
  surfaceElevated: string;
  /** Primary text and display numbers. */
  textPrimary: string;
  /** Labels, captions, secondary values. */
  textSecondary: string;
  /** Subtle hairline borders and separators. */
  border: string;
  /** The one accent, as a tint: links, icons, focus rings, selected states. */
  accent: string;
  /** The accent family's filled-control variant, dark enough to carry onAccent at 4.5:1. */
  accentFill: string;
  /** Label colour on accentFill controls. */
  onAccent: string;
  /** Semantic: healthy signal. */
  healthy: string;
  /** Semantic: worth investigating. */
  investigate: string;
  /** Semantic: red flag. */
  flag: string;
}

export const lightPalette: ThemePalette = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1D1D1F',
  textSecondary: '#65656A',
  border: '#D2D2D7',
  accent: '#007AFF',
  accentFill: '#0071E3',
  onAccent: '#FFFFFF',
  healthy: '#248A3D',
  investigate: '#C93400',
  flag: '#D70015',
};

export const darkPalette: ThemePalette = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  textPrimary: '#F5F5F7',
  textSecondary: '#98989F',
  border: '#38383A',
  accent: '#0A84FF',
  accentFill: '#0071E3',
  onAccent: '#FFFFFF',
  healthy: '#30DB5B',
  investigate: '#FFB340',
  flag: '#FF6961',
};
