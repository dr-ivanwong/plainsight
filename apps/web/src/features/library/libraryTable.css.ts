import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
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

// Separate borders, as on the dashboard's table: the sticky name column
// repaints its own background while the figures scroll beneath it.
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

export const textHead = style({
  ...headText,
  textAlign: 'left',
  padding: tableTokens.cellPadding,
  verticalAlign: 'bottom',
  whiteSpace: 'nowrap',
  selectors: {
    '&:first-child': {
      position: 'sticky',
      left: 0,
      backgroundColor: colour.background
    }
  }
});

export const numericHead = style({
  ...headText,
  textAlign: 'right',
  padding: tableTokens.cellPadding,
  verticalAlign: 'bottom',
  whiteSpace: 'nowrap'
});

export const sparkHead = style({
  padding: tableTokens.cellPadding
});

/** The header is the sort control (finance-look gap plan §5): quiet text, arrow when active. */
export const sortButton = style({
  border: 'none',
  backgroundColor: 'transparent',
  padding: 0,
  fontFamily: fontStack,
  fontSize: 'inherit',
  letterSpacing: 'inherit',
  fontWeight: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  borderRadius: radius.small,
  minHeight: tableTokens.rowHeight,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
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

export const nameLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: space[8],
  height: '100%',
  minHeight: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  textDecoration: 'none',
  color: colour.textPrimary,
  borderRadius: radius.small,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: `-${focusRing.width}`
  }
});

export const name = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.semibold,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '200px'
});

export const sampleChip = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.full,
  padding: `0 ${space[8]}`,
  whiteSpace: 'nowrap'
});

export const textCell = style({
  height: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  textAlign: 'left',
  verticalAlign: 'middle',
  borderTop: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const numericCell = style({
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

export const sparkCell = style({
  height: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  verticalAlign: 'middle',
  borderTop: `${hairline} solid ${colour.border}`,
  width: '96px',
  minWidth: '96px'
});

export const quiet = style({
  color: colour.textSecondary
});

/** The red-flag count, in the one colour it owns (main plan §4). */
export const flagCount = style({
  color: colour.investigate,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
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
