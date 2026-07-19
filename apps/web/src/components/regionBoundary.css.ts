import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, lineHeight, radius, space } from '../styles/tokens.css';

/** The quiet inset a crashed region collapses into: bordered, never alarming. */
export const fallback = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  padding: space[16],
  border: `1px solid ${colour.border}`,
  borderRadius: radius.medium,
  backgroundColor: colour.surface
});

export const message = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const region = style({
  color: colour.textPrimary,
  fontWeight: fontWeight.semibold
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[8]
});

export const note = style({
  fontSize: fontSize.caption1,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});
