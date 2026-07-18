import { style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontStack,
  fontWeight,
  focusRing,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget
} from '../../styles/tokens.css';

export const strip = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[16],
  marginBottom: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  border: `${hairline} solid ${colour.border}`
});

export const line = style({
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  lineHeight: lineHeight.body
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[8]
});

export const action = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});
