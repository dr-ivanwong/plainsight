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
 * - textPrimary and textSecondary reach 4.5:1 on background, surface,
 *   surfaceElevated, and surfaceHover.
 * - accent reaches 3:1 on background and surface (large text and interactive
 *   elements).
 * - healthy, investigate, and flag reach 3:1 on background, surface,
 *   surfaceElevated, and surfaceHover.
 * - onAccent reaches 4.5:1 on accentFill.
 * - each chartSeries step reaches 3:1 on background and surface.
 *
 * The chart series ramp is a single-hue categorical set: up to four company
 * lines on the compare trend, all drawn from the one accent family (main plan
 * §4; distinct hues would mint new accents). Identity therefore rides on
 * lightness, which survives colour-vision deficiency; steps are spaced for
 * adjacent-pair separation and validated against both surfaces. Where the
 * window ran out, the palest step keeps its chroma (a washed line reads grey
 * for everyone) at the cost of adjacent-pair distance for the rarest CVD
 * axis; the chart never relies on colour alone regardless: it ships a
 * legend, line-end labels, hover values, and a table fallback.
 */

export interface ThemePalette {
  /** App background behind everything. */
  background: string;
  /** Card and row surface. */
  surface: string;
  /** Raised surface: sheets and popovers. Light mode elevates with shadow instead, so it stays white. */
  surfaceElevated: string;
  /** Card surface while hovered on pointer devices: light stays white and lets the shadow deepen; dark steps brightness between surface and surfaceElevated (dashboard design plan §3.1). */
  surfaceHover: string;
  /** Primary text and display numbers. */
  textPrimary: string;
  /** Labels, captions, secondary values. */
  textSecondary: string;
  /** Subtle hairline borders and separators. */
  border: string;
  /** The practitioner table's section header rows (dashboard design plan §3.4): one step off the app background either side. */
  tableHeaderBackground: string;
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
  /**
   * Text-grade variants of the two trend colours, for 13px delta-chip figures
   * (dashboard design plan §4.3): held to 4.5:1 on every rendered background,
   * where the base pair is held to 3:1 as graphics (dots, sparklines). Dark
   * mode's base pair already clears the text floor, so the variants alias it;
   * light healthy needs a darker step.
   */
  healthyText: string;
  investigateText: string;
  /** Semantic: red flag. */
  flag: string;
  /** Compare-trend series ramp, darkest first: slot colours for up to four company lines. */
  chartSeries1: string;
  chartSeries2: string;
  chartSeries3: string;
  chartSeries4: string;
}

export const lightPalette: ThemePalette = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#FFFFFF',
  textPrimary: '#1D1D1F',
  textSecondary: '#65656A',
  border: '#D2D2D7',
  tableHeaderBackground: '#E8E8ED',
  accent: '#007AFF',
  accentFill: '#0071E3',
  onAccent: '#FFFFFF',
  healthy: '#248A3D',
  investigate: '#C93400',
  healthyText: '#1E7A33',
  investigateText: '#C93400',
  flag: '#D70015',
  chartSeries1: '#082F63',
  chartSeries2: '#0A4C96',
  chartSeries3: '#0067D2',
  chartSeries4: '#1489F5',
};

export const darkPalette: ThemePalette = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  surfaceHover: '#252527',
  textPrimary: '#F5F5F7',
  textSecondary: '#98989F',
  border: '#38383A',
  tableHeaderBackground: '#141416',
  accent: '#0A84FF',
  accentFill: '#0071E3',
  onAccent: '#FFFFFF',
  healthy: '#30DB5B',
  investigate: '#FFB340',
  healthyText: '#30DB5B',
  investigateText: '#FFB340',
  flag: '#FF6961',
  chartSeries1: '#2E77CE',
  chartSeries2: '#4E97E8',
  chartSeries3: '#74AFF6',
  chartSeries4: '#8FC3FF',
};
