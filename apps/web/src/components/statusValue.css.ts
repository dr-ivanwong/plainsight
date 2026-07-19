import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, lineHeight, tracking } from '../styles/tokens.css';

/** The 34px tabular value (frontend spec §3): the dashboard card and detail sheet scale. */
export const ok = style({
  fontSize: fontSize.largeTitle,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  fontVariantNumeric: 'tabular-nums',
  color: colour.textPrimary
});

/** The same value at table scale, for grids where twelve rows share a screen. */
export const okTable = style({
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  lineHeight: lineHeight.body,
  fontVariantNumeric: 'tabular-nums',
  color: colour.textPrimary
});

/** The key-stats scale (dashboard design plan §5.3): four headline figures between hero and grid. */
export const okStat = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  fontVariantNumeric: 'tabular-nums',
  color: colour.textPrimary
});

/** Degenerate and incomplete states speak quietly, in words. */
export const quiet = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});
