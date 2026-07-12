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

export const chrome = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: space[16],
  marginBottom: space[24]
});

export const back = style({
  justifySelf: 'start',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  borderRadius: radius.medium,
  color: colour.accent,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const title = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  marginBottom: space[32]
});

export const dangerGroup = style([
  group,
  {
    paddingTop: space[16],
    borderTop: `${hairline} solid ${colour.border}`
  }
]);

export const groupTitle = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary
});

export const note = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const error = style({
  fontSize: fontSize.subhead,
  color: colour.flag
});

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[12]
});

export const fileInput = style({
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  color: colour.textSecondary
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16]
});

export const rowLabel = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textPrimary
});

export const quietAction = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
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

export const meter = style({
  width: '100%',
  height: space[8],
  borderRadius: radius.full,
  backgroundColor: colour.surface,
  overflow: 'hidden'
});

export const meterFill = style({
  height: '100%',
  borderRadius: radius.full,
  backgroundColor: colour.accentFill
});

export const quarantineList = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[8]
});

export const quarantineRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  padding: space[12],
  backgroundColor: colour.surface,
  borderRadius: radius.medium
});

export const quarantineText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  minWidth: 0
});

export const quarantineActions = style({
  display: 'flex',
  gap: space[8],
  flexShrink: 0
});

export const confirmInput = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surface,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  width: '260px',
  maxWidth: '100%',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

/** The one destructive control: red only here, and only armed by the typed name. */
export const dangerAction = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[24]}`,
  border: 'none',
  borderRadius: radius.medium,
  backgroundColor: colour.flag,
  color: colour.onAccent,
  fontFamily: fontStack,
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':disabled': {
    opacity: 0.4,
    cursor: 'not-allowed'
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const sheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  padding: space[24]
});

export const sheetTitle = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const countList = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  fontVariantNumeric: 'tabular-nums'
});

export const sheetActions = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[12],
  marginTop: space[8]
});
