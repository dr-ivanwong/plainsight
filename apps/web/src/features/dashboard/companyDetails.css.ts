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

export const form = style({
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

/** The fixed half: ticker, exchange and currency, displayed and deliberately not editable. */
export const facts = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  margin: 0,
  paddingTop: space[12],
  borderTop: `${hairline} solid ${colour.border}`
});

export const factRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: space[16]
});

export const factLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const factValue = style({
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums'
});

export const factsNote = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const error = style({
  fontSize: fontSize.subhead,
  color: colour.flag
});

export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[12],
  marginTop: space[8]
});
