import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget
} from '../styles/tokens.css';

export const card = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[12],
  padding: `${space[8]} ${space[12]}`,
  marginBottom: space[16],
  backgroundColor: colour.surface,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.medium
});

export const body = style({
  fontSize: fontSize.caption1,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const dismiss = style({
  minWidth: touchTarget,
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontSize: fontSize.caption1,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});
