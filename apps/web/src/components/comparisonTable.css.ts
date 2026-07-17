import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  hairline,
  space,
  tracking
} from '../styles/tokens.css';

/** Horizontal scroll owns overflow; the metric-label column stays put (frontend spec §3). */
export const scroller = style({
  width: '100%',
  overflowX: 'auto'
});

export const table = style({
  width: '100%',
  borderCollapse: 'collapse'
});

/** The codebase's visually-hidden idiom (segmentedControl.css.ts): present to the accessibility tree only. */
export const srOnly = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  clipPath: 'inset(50%)',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
});

const stickyLabel = style({
  position: 'sticky',
  left: 0,
  zIndex: 1,
  backgroundColor: colour.background,
  textAlign: 'left',
  minWidth: '140px',
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

export const companyHead = style({
  padding: `${space[8]} ${space[8]}`,
  textAlign: 'right',
  verticalAlign: 'bottom',
  minWidth: '128px'
});

export const companyLink = style({
  display: 'inline-block',
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  color: colour.textPrimary,
  textDecoration: 'none',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const companyFacts = style({
  display: 'block',
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const rowLabel = style([
  stickyLabel,
  {
    borderTop: `${hairline} solid ${colour.border}`,
    fontSize: fontSize.subhead,
    fontWeight: fontWeight.regular,
    color: colour.textPrimary
  }
]);

export const cell = style({
  borderTop: `${hairline} solid ${colour.border}`,
  padding: `${space[8]} ${space[8]}`,
  textAlign: 'right',
  verticalAlign: 'middle',
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

/** The best-in-row mark: subtle, informational, never interactive, so it stays a quiet neutral. */
export const tick = style({
  color: colour.textSecondary,
  fontSize: fontSize.caption1
});

export const noData = style({
  color: colour.textSecondary,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption
});
