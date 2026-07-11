import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, lineHeight, tracking } from '../styles/tokens.css';

/** The 34px tabular value (frontend spec §3). */
export const ok = style({
  fontSize: fontSize.largeTitle,
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
