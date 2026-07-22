import { style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontWeight,
  hairline,
  radius,
  space,
  table as tableTokens
} from '../../styles/tokens.css';

export const scroller = style({
  overflowX: 'auto'
});

export const tradeScroller = style({
  overflowX: 'auto',
  maxHeight: '360px',
  overflowY: 'auto',
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.medium
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

export const focusedRow = style({
  backgroundColor: colour.surfaceHover
});

export const verdictCell = style({
  padding: tableTokens.cellPadding,
  borderBottom: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const tradeCell = style({
  padding: tableTokens.cellPadding,
  borderBottom: `${hairline} solid ${colour.border}`,
  fontSize: fontSize.caption1,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const chartFrame = style({
  marginTop: space[16],
  marginBottom: space[16]
});

export const statsTable = style({
  borderCollapse: 'separate',
  borderSpacing: 0,
  marginTop: space[16],
  minWidth: '420px'
});

export const statHead = style({
  padding: `${space[4]} ${space[16]}`,
  textAlign: 'right',
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  color: colour.textSecondary
});

export const statLabel = style({
  padding: `${space[4]} ${space[16]} ${space[4]} 0`,
  textAlign: 'left',
  fontSize: fontSize.caption1,
  color: colour.textSecondary,
  fontWeight: fontWeight.regular,
  whiteSpace: 'nowrap'
});

export const statValue = style({
  padding: `${space[4]} ${space[16]}`,
  textAlign: 'right',
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const verdictHeading = style({
  margin: 0,
  marginTop: space[24],
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

export const gates = style({
  listStyle: 'none',
  margin: 0,
  marginTop: space[8],
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[8]
});

export const gate = style({
  display: 'flex',
  gap: space[8],
  fontSize: fontSize.caption1,
  alignItems: 'baseline'
});

export const gateMet = style({
  color: colour.textPrimary,
  fontWeight: fontWeight.semibold,
  minWidth: '56px'
});

export const gateUnmet = style({
  color: colour.textSecondary,
  fontWeight: fontWeight.semibold,
  minWidth: '56px'
});

export const tradesHeading = style({
  margin: 0,
  marginTop: space[24],
  marginBottom: space[8],
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

export const legLink = style({
  color: colour.accent,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  selectors: { '&:hover': { textDecoration: 'underline' } }
});
