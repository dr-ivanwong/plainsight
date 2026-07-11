import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, radius, space, tracking } from '../styles/tokens.css';

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  minWidth: 0
});

export const label = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary
});

export const footnote = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});

/** Amber once the price is more than ninety days old (frontend spec §3). */
export const footnoteStale = style([
  footnote,
  {
    color: colour.investigate
  }
]);
