import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontStackSerif,
  fontWeight,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const sheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16]
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16]
});

export const title = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
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
  fontSize: fontSize.body,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const emptyNote = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  lineHeight: lineHeight.body
});

export const rows = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column'
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  width: '100%',
  minHeight: touchTarget,
  padding: `${space[8]} 0`,
  border: 'none',
  borderTop: `${hairline} solid ${colour.border}`,
  backgroundColor: 'transparent',
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  textAlign: 'left',
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const rowWhen = style({
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const rowMeta = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[8],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

/** The quiet mark that a version carries the numbers it was written against. */
export const snapshotChip = style({
  padding: `0 ${space[8]}`,
  borderRadius: radius.full,
  border: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const back = style({
  alignSelf: 'flex-start',
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
    outlineOffset: focusRing.offset
  }
});

export const versionWhen = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});

export const sections = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[24]
});

export const sectionLabel = style({
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.sectionLabel,
  textTransform: 'uppercase',
  color: colour.textSecondary
});

export const body = style({
  margin: `${space[8]} 0 0`,
  fontSize: fontSize.body,
  lineHeight: lineHeight.body,
  color: colour.textPrimary,
  whiteSpace: 'pre-wrap'
});

export const bodySerif = style([body, { fontFamily: fontStackSerif }]);
