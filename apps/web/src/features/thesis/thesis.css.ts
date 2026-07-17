import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontStackSerif,
  fontWeight,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const chrome = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  marginBottom: space[24]
});

export const back = style({
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
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const title = style({
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

/** The quiet autosave ticker (frontend spec §2): no toasts, ever. */
export const ticker = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  textAlign: 'right',
  minWidth: '96px'
});

export const tickerError = style([ticker, { color: colour.investigate }]);

export const sections = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[40]
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8]
});

export const label = style({
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.sectionLabel,
  textTransform: 'uppercase',
  color: colour.textSecondary
});

/**
 * The writing surface itself: no box, no border, just text on the page.
 * The field grows with its content where the platform supports it and
 * falls back to a generous minimum elsewhere.
 */
export const body = style({
  border: 'none',
  padding: 0,
  backgroundColor: 'transparent',
  resize: 'none',
  width: '100%',
  minHeight: '96px',
  fontFamily: fontStack,
  fontSize: fontSize.body,
  lineHeight: lineHeight.body,
  color: colour.textPrimary,
  fieldSizing: 'content',
  '::placeholder': {
    color: colour.textSecondary
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: '6px',
    borderRadius: radius.small
  }
});

export const bodySerif = style([body, { fontFamily: fontStackSerif }]);

export const saveRow = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[16],
  marginTop: space[48]
});

export const attachRow = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[12],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  gap: space[12],
  marginTop: space[24],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const footerSpacer = style({
  flex: 1
});

export const historyLink = style({
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
  },
  // Nothing to export or list yet: the action rests rather than vanishes.
  ':disabled': {
    color: colour.textSecondary,
    cursor: 'default'
  }
});
