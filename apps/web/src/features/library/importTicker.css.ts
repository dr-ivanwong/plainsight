import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontWeight,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16],
  padding: space[24]
});

export const heading = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const searchInput = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surface,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.body,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const hint = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary
});

export const error = style({
  fontSize: fontSize.subhead,
  color: colour.flag
});

export const results = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column'
});

export const resultButton = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: space[8],
  width: '100%',
  minHeight: touchTarget,
  padding: `${space[8]} ${space[12]}`,
  border: 'none',
  borderRadius: radius.small,
  backgroundColor: 'transparent',
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.body,
  textAlign: 'left',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: colour.surface
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const resultTicker = style({
  fontWeight: fontWeight.semibold,
  fontVariantNumeric: 'tabular-nums'
});

export const resultName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});

export const exchangeBadge = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.small,
  padding: `0 ${space[4]}`
});

export const progress = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: `${space[16]} 0`
});

export const progressPrimary = style({
  fontSize: fontSize.body,
  color: colour.textPrimary
});

export const progressSecondary = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary
});

export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[12],
  marginTop: space[8]
});
