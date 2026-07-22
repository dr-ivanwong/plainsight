import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

/** The closed state: one quiet line stating the benchmark, or its absence. */
export const summary = style({
  alignSelf: 'flex-start',
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontFamily: fontStack,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontVariantNumeric: 'tabular-nums',
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[12],
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.medium
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const fieldLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const input = style({
  minHeight: touchTarget,
  width: '112px',
  padding: `0 ${space[12]}`,
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surfaceElevated,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: space[8]
});

export const action = style({
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.caption1,
  fontVariantNumeric: 'tabular-nums',
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const error = style({
  margin: 0,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.flag
});

/** The Owner's lens on what a reference line is and is not. */
export const lens = style({
  margin: 0,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  lineHeight: lineHeight.body,
  color: colour.textSecondary,
  maxWidth: '360px'
});
