/**
 * The design-token system (main plan §4), as typed Vanilla Extract tokens.
 *
 * Colour flows through a theme contract so every component styles against CSS
 * variables and both themes ship from day one. Everything else (type scale,
 * spacing, radii, motion) is a plain typed constant. No freestyle values
 * anywhere: if a style needs a value, it needs a token.
 */
import {
  assignVars,
  createThemeContract,
  globalStyle,
  style,
} from '@vanilla-extract/css';

import { darkPalette, lightPalette, type ThemePalette } from './palette';

// Colour: theme contract and application

const contractShape: Record<keyof ThemePalette, null> = {
  background: null,
  surface: null,
  surfaceElevated: null,
  surfaceHover: null,
  textPrimary: null,
  textSecondary: null,
  border: null,
  accent: null,
  accentFill: null,
  onAccent: null,
  healthy: null,
  investigate: null,
  flag: null,
  chartSeries1: null,
  chartSeries2: null,
  chartSeries3: null,
  chartSeries4: null,
};

/** Theme-aware colour variables. Values come from palette.ts per theme. */
export const colour = createThemeContract(contractShape);

/**
 * Theme-aware card shadows (dashboard design plan §3.1). Light mode carries
 * depth with barely-there shadows; dark mode resolves them to none and steps
 * surface brightness instead. Not palette data: shadows are not colours, and
 * palette.ts stays pure colour for the contrast test.
 */
export const elevation = createThemeContract({
  card: null,
  cardHover: null,
});

const lightElevation = {
  card: '0 1px 3px rgba(0, 0, 0, 0.08)',
  cardHover: '0 2px 8px rgba(0, 0, 0, 0.10)',
};

const darkElevation = {
  card: 'none',
  cardHover: 'none',
};

// Light is the default; the dark palette applies when the system asks for it.
globalStyle(':root', {
  vars: {
    ...assignVars(colour, lightPalette),
    ...assignVars(elevation, lightElevation),
  },
  '@media': {
    '(prefers-color-scheme: dark)': {
      vars: {
        ...assignVars(colour, darkPalette),
        ...assignVars(elevation, darkElevation),
      },
    },
  },
});

// Explicit override for Phase 1's auto/light/dark setting: setting data-theme
// on <html> outranks the bare :root rules above in either direction, and
// removing the attribute returns to the system preference.
globalStyle(':root[data-theme="light"]', {
  vars: {
    ...assignVars(colour, lightPalette),
    ...assignVars(elevation, lightElevation),
  },
});
globalStyle(':root[data-theme="dark"]', {
  vars: {
    ...assignVars(colour, darkPalette),
    ...assignVars(elevation, darkElevation),
  },
});

// Typography

export const fontStack =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** The thesis editor's optional serif body (frontend spec §3); ui-serif is New York on Apple platforms. */
export const fontStackSerif =
  "ui-serif, 'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, 'Times New Roman', serif";

/** The full type scale. No sizes exist outside these eight steps. */
export const fontSize = {
  caption2: '11px',
  caption1: '13px',
  subhead: '15px',
  body: '17px',
  title3: '20px',
  title2: '22px',
  title1: '28px',
  largeTitle: '34px',
} as const;

/** Weight carries hierarchy; at most two weights per screen. */
export const fontWeight = {
  regular: '400',
  semibold: '600',
} as const;

export const tracking = {
  /** For the 28px and 34px display sizes. */
  display: '-0.02em',
  /** For the 11px and 13px caption sizes. */
  caption: '0.01em',
  /** For all-caps micro-labels (the dashboard's section headers): wide enough to keep 11px capitals legible (dashboard design plan §3.3). */
  sectionLabel: '0.06em',
} as const;

export const lineHeight = {
  body: '1.5',
  display: '1.15',
} as const;

// Spacing, layout, and shape

/** The full spacing scale, keyed by pixel step. No values exist between steps. */
export const space = {
  4: '4px',
  8: '8px',
  12: '12px',
  16: '16px',
  20: '20px',
  24: '24px',
  32: '32px',
  40: '40px',
  48: '48px',
  64: '64px',
} as const;

export const layout = {
  /** The standard centred content column (frontend spec §1.2). */
  columnMax: '720px',
  /** The wider column for the dashboard and compare screens (frontend spec §7). */
  columnWideMax: '960px',
  /** The desktop company section rail (frontend spec §7, ≥1200px). */
  railWidth: '200px',
  /** Width cap for a stacked action group in hero empty states. */
  actionColumnMax: '320px',
  /** Readable measure for centred prose (welcome panes, explainers). */
  proseMax: '480px',
} as const;

export const radius = {
  small: '6px',
  medium: '10px',
  large: '14px',
  full: '9999px',
} as const;

/** Hairline width for subtle borders and separators. */
export const hairline = '1px';

/** The dimmed backdrop behind modal sheets; identical in both themes. */
export const scrim = 'rgba(0, 0, 0, 0.4)';

/** Minimum touch target on every interactive element (main plan §4). */
export const touchTarget = '44px';

/** Focus rings are designed, not stripped; their colour is colour.accent. */
export const focusRing = {
  width: '2px',
  offset: '2px',
} as const;

// Motion

export const motion = {
  /** The only easing curve: a spring, never a linear ease. */
  spring: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  durationFast: '200ms',
  durationMedium: '250ms',
  durationSlow: '350ms',
  /** Under prefers-reduced-motion, all movement collapses to opacity fades at most this long. */
  reducedMotionFade: '150ms',
} as const;

export const press = {
  /** Buttons scale to this on press (main plan §4). */
  scale: 0.97,
  /** Press feedback when reduced motion strips the scale. */
  reducedMotionOpacity: 0.8,
} as const;

// Utilities

/** Apply wherever numbers align vertically: tables, dashboards, tickers. */
export const tabularNums = style({
  fontVariantNumeric: 'tabular-nums',
});
