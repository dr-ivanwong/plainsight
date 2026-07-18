import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../styles/tokens.css';

export const peek = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[12],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  border: `${hairline} solid ${colour.border}`
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[8]
});

export const caption = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums',
  overflowWrap: 'anywhere'
});

export const close = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: touchTarget,
  minHeight: touchTarget,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontSize: fontSize.subhead,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const image = style({
  width: '100%',
  height: 'auto',
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`
});

export const note = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  lineHeight: lineHeight.body
});
