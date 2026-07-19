import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  hairline,
  radius,
  space,
  table as tableTokens,
  tracking
} from '../../styles/tokens.css';

export const scroller = style({
  width: '100%',
  overflowX: 'auto'
});

// Separate borders, not collapse: the sticky metric column repaints its own
// background while the years scroll beneath it, which collapsed borders smear.
export const table = style({
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0
});

const headText = {
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary
} as const;

export const metricColHead = style({
  ...headText,
  textAlign: 'left',
  padding: tableTokens.cellPadding,
  verticalAlign: 'bottom',
  position: 'sticky',
  left: 0,
  backgroundColor: colour.background
});

export const yearHead = style({
  ...headText,
  textAlign: 'right',
  padding: tableTokens.cellPadding,
  verticalAlign: 'bottom',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums'
});

/** A group's header row: the card grid's section label, on its own quiet band (dashboard design plan §5.4). */
export const sectionRow = style({
  height: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  textAlign: 'left',
  verticalAlign: 'middle',
  backgroundColor: colour.tableHeaderBackground,
  fontSize: fontSize.caption2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.sectionLabel,
  textTransform: 'uppercase',
  color: colour.textSecondary
});

export const rowHead = style({
  height: tableTokens.rowHeight,
  padding: 0,
  textAlign: 'left',
  borderTop: `${hairline} solid ${colour.border}`,
  position: 'sticky',
  left: 0,
  backgroundColor: colour.background,
  whiteSpace: 'nowrap'
});

/** The row's door to its detail sheet; fills the cell so the 44px row is the target. */
export const rowLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: space[8],
  height: '100%',
  minHeight: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.semibold,
  color: colour.textPrimary,
  textDecoration: 'none',
  borderRadius: radius.small,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: `-${focusRing.width}`
  }
});

/** The row-level health dot, before the label (dashboard design plan §5.4, §4.2). */
const dot = style({
  width: '6px',
  height: '6px',
  borderRadius: radius.full,
  flexShrink: 0
});

export const dotHealthy = style([dot, { backgroundColor: colour.healthy }]);
export const dotInvestigate = style([dot, { backgroundColor: colour.investigate }]);

export const cell = style({
  height: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  textAlign: 'right',
  verticalAlign: 'middle',
  borderTop: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const quiet = style({
  color: colour.textSecondary
});

export const cellLink = style({
  color: colour.accent,
  textDecoration: 'none',
  borderRadius: radius.small,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

/** The collapsed valuation row seats the enter-price card across every column. */
export const priceCell = style({
  padding: `${space[8]} 0`,
  borderTop: `${hairline} solid ${colour.border}`
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
