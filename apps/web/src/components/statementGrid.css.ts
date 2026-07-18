import { style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontWeight,
  hairline,
  radius,
  space,
  tracking
} from '../styles/tokens.css';

/** Horizontal scroll owns overflow; the label column stays put (frontend spec §7). */
export const scroller = style({
  width: '100%',
  overflowX: 'auto'
});

export const table = style({
  width: '100%',
  borderCollapse: 'collapse'
});

const stickyLabel = style({
  position: 'sticky',
  left: 0,
  zIndex: 1,
  backgroundColor: colour.background,
  textAlign: 'left',
  minWidth: '220px',
  maxWidth: '280px',
  padding: `${space[8]} ${space[16]} ${space[8]} 0`
});

export const labelHead = style([
  stickyLabel,
  {
    fontSize: fontSize.caption1,
    letterSpacing: tracking.caption,
    fontWeight: fontWeight.regular,
    color: colour.textSecondary,
    verticalAlign: 'bottom'
  }
]);

export const yearHead = style({
  padding: `${space[8]} ${space[8]}`,
  textAlign: 'right',
  verticalAlign: 'bottom',
  minWidth: '128px'
});

export const fy = style({
  display: 'block',
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  color: colour.textPrimary,
  fontVariantNumeric: 'tabular-nums'
});

export const scaleNote = style({
  display: 'block',
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

/** The set-once-per-year scale control, dressed as quietly as the note it sits in. */
export const scaleSelect = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  backgroundColor: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer'
});

export const headerNote = style({
  display: 'block',
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const labelCell = style([
  stickyLabel,
  {
    borderTop: `${hairline} solid ${colour.border}`
  }
]);

export const itemLabel = style({
  display: 'block',
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.regular,
  color: colour.textPrimary
});

export const hint = style({
  display: 'block',
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

export const cell = style({
  borderTop: `${hairline} solid ${colour.border}`,
  padding: `${space[4]} ${space[4]}`,
  verticalAlign: 'middle'
});

/** Review caution (frontend spec §3): the amber bands, never red. */
export const cellAmber = style([
  cell,
  {
    boxShadow: `inset 2px 0 0 ${colour.investigate}`
  }
]);

/** A failing identity gate marks its fields, not a modal (frontend spec §3). */
export const cellBreached = style([
  cell,
  {
    boxShadow: `inset 0 0 0 1px ${colour.investigate}`,
    borderRadius: radius.small
  }
]);
