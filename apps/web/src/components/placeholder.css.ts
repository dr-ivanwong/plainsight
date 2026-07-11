import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, lineHeight, space, tracking } from '../styles/tokens.css';

export const wrap = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  paddingTop: space[32]
});

export const title = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  color: colour.textPrimary
});

export const note = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const link = style({
  color: colour.accent,
  fontSize: fontSize.subhead
});
