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
  railMedia,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

/** Back affordance, centred title, quiet status: one top bar, three zones. */
// At the rail breakpoint the back affordance recedes (the rail owns the way
// up); the title moves to the left edge and the autosave status line keeps
// its place at the right, because quiet feedback never hides.
export const chrome = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: space[16],
  marginBottom: space[16],
  '@media': {
    [railMedia]: { gridTemplateColumns: 'auto 1fr' }
  }
});

export const back = style({
  justifySelf: 'start',
  '@media': {
    [railMedia]: { display: 'none' }
  },
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  borderRadius: radius.medium,
  color: colour.accent,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const title = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  whiteSpace: 'nowrap'
});

export const ticker = style({
  justifySelf: 'end',
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const tickerError = style([
  ticker,
  {
    color: colour.flag
  }
]);

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  marginBottom: space[16]
});

export const addYearButton = style({
  display: 'inline-flex',
  alignItems: 'center',
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
    outlineOffset: focusRing.offset
  }
});

/** The quiet mark that the online-only file import is hidden (frontend spec §2). */
export const offlinePill = style({
  padding: `${space[4]} ${space[12]}`,
  borderRadius: radius.full,
  border: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const emptyNote = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary,
  marginBottom: space[16]
});

export const addForm = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: space[16],
  padding: `${space[16]} 0 ${space[24]}`
});

export const addField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const addLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const addInput = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surface,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const addError = style({
  width: '100%',
  fontSize: fontSize.subhead,
  color: colour.flag
});
