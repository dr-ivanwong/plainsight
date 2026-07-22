import { style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontWeight,
  hairline,
  space,
  table as tableTokens
} from '../../styles/tokens.css';

export const scroller = style({
  overflowX: 'auto'
});

export const table = style({
  borderCollapse: 'separate',
  borderSpacing: 0,
  width: '100%'
});

const headBase = {
  padding: tableTokens.cellPadding,
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  color: colour.textSecondary,
  backgroundColor: colour.tableHeaderBackground,
  borderBottom: `${hairline} solid ${colour.border}`,
  whiteSpace: 'nowrap'
} as const;

export const textHead = style({ ...headBase, textAlign: 'left' });

export const numericHead = style({ ...headBase, textAlign: 'right' });

export const numericCell = style({
  height: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  textAlign: 'right',
  borderBottom: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const pairCell = style({
  height: tableTokens.rowHeight,
  padding: tableTokens.cellPadding,
  borderBottom: `${hairline} solid ${colour.border}`,
  whiteSpace: 'nowrap'
});

export const pairButton = style({
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  color: colour.accent,
  cursor: 'pointer',
  fontVariantNumeric: 'tabular-nums'
});

export const legCell = style({
  padding: tableTokens.cellPadding,
  borderBottom: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  verticalAlign: 'middle'
});

export const legTicker = style({
  display: 'block',
  fontWeight: fontWeight.semibold,
  color: colour.textPrimary
});

export const legLink = style({
  display: 'block',
  fontWeight: fontWeight.semibold,
  color: colour.accent,
  textDecoration: 'none',
  selectors: { '&:hover': { textDecoration: 'underline' } }
});

export const legNote = style({
  display: 'block',
  color: colour.textSecondary
});

export const legFlags = style({
  display: 'block',
  color: colour.investigateText,
  fontVariantNumeric: 'tabular-nums'
});

export const empty = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  margin: 0,
  marginTop: space[12]
});
