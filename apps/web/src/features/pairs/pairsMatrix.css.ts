import { style } from '@vanilla-extract/css';

import { colour, fontSize, hairline, space } from '../../styles/tokens.css';

const CELL = '18px';

export const scroller = style({
  overflowX: 'auto',
  marginTop: space[16],
  paddingBottom: space[8]
});

export const table = style({
  borderCollapse: 'separate',
  borderSpacing: '1px'
});

export const cornerCell = style({
  position: 'sticky',
  left: 0,
  backgroundColor: colour.background,
  zIndex: 1
});

export const columnHead = style({
  height: '44px',
  verticalAlign: 'bottom',
  padding: 0
});

export const columnLabel = style({
  display: 'inline-block',
  writingMode: 'vertical-rl',
  transform: 'rotate(180deg)',
  fontSize: '9px',
  fontWeight: '400',
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});

export const rowHead = style({
  position: 'sticky',
  left: 0,
  backgroundColor: colour.background,
  fontSize: '9px',
  fontWeight: '400',
  color: colour.textSecondary,
  textAlign: 'right',
  paddingRight: space[4],
  fontVariantNumeric: 'tabular-nums',
  zIndex: 1
});

export const cell = style({
  padding: 0,
  width: CELL,
  height: CELL
});

export const cellButton = style({
  display: 'block',
  width: CELL,
  height: CELL,
  padding: 0,
  border: 'none',
  borderRadius: '2px',
  cursor: 'pointer'
});

export const diagonalCell = style({
  width: CELL,
  height: CELL,
  backgroundColor: colour.border
});

export const emptyCell = style({
  width: CELL,
  height: CELL,
  border: `${hairline} dashed ${colour.border}`
});

/** Kept for the legend line beneath the grid. */
export const legend = style({
  fontSize: fontSize.caption2,
  color: colour.textSecondary
});
