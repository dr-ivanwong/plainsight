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

export const chrome = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  marginBottom: space[24]
});

export const back = style({
  // At the rail breakpoint the rail owns wayfinding; this back affordance
  // duplicates one of its destinations, so it recedes.
  '@media': { [railMedia]: { display: 'none' } },
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
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

/** The quiet mark that the online-only affordance is hidden (frontend spec §2). */
export const offlinePill = style({
  padding: `${space[4]} ${space[12]}`,
  borderRadius: radius.full,
  border: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const rows = style({
  display: 'flex',
  flexDirection: 'column'
});

export const row = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: `${space[16]} 0`,
  borderTop: `${hairline} solid ${colour.border}`
});

export const rowHead = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: space[16]
});

export const name = style({
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

export const policy = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const keyLine = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[8]
});

export const mask = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  letterSpacing: '0.2em'
});

export const revealedKey = style({
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: fontSize.caption1,
  color: colour.textPrimary,
  overflowWrap: 'anywhere'
});

const quietAction = style({
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
  },
  ':disabled': {
    color: colour.textSecondary,
    cursor: 'default'
  }
});

export const action = quietAction;

export const probeChip = style({
  padding: `0 ${space[8]}`,
  borderRadius: radius.full,
  border: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const addForm = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: space[8]
});

export const keyInput = style({
  flex: 1,
  minWidth: '220px',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.medium,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surface,
  color: colour.textPrimary,
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: fontSize.subhead,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  },
  '::placeholder': {
    fontFamily: fontStack,
    color: colour.textSecondary
  }
});

export const sectionTitle = style({
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.sectionLabel,
  textTransform: 'uppercase',
  color: colour.textSecondary,
  marginTop: space[32]
});

export const ladder = style({
  margin: `${space[8]} 0 0`,
  paddingLeft: space[20],
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  fontSize: fontSize.subhead,
  color: colour.textPrimary
});

export const note = style({
  marginTop: space[8],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  lineHeight: lineHeight.body
});
