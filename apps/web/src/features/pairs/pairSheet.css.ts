import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, hairline, space, tracking } from '../../styles/tokens.css';

export const sheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16],
  padding: space[24],
  maxWidth: '560px'
});

export const title = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  fontVariantNumeric: 'tabular-nums',
  margin: 0
});

export const provenance = style({
  margin: 0,
  fontSize: fontSize.caption1,
  color: colour.textSecondary
});

export const statistics = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16],
  margin: 0
});

export const statistic = style({
  borderTop: `${hairline} solid ${colour.border}`,
  paddingTop: space[12]
});

export const statisticLabel = style({
  fontSize: fontSize.caption1,
  color: colour.textSecondary
});

export const statisticValue = style({
  margin: 0,
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  fontVariantNumeric: 'tabular-nums'
});

export const statisticMeaning = style({
  margin: 0,
  marginTop: space[4],
  fontSize: fontSize.caption1,
  color: colour.textSecondary
});

export const verdict = style({
  margin: 0,
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

export const gates = style({
  listStyle: 'none',
  margin: 0,
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

export const legsTitle = style({
  margin: 0,
  marginTop: space[8],
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold
});

export const legsCaption = style({
  margin: 0,
  fontSize: fontSize.caption1,
  color: colour.textSecondary
});

export const leg = style({
  borderTop: `${hairline} solid ${colour.border}`,
  paddingTop: space[12],
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  fontSize: fontSize.caption1
});

export const legTicker = style({
  fontWeight: fontWeight.semibold,
  fontVariantNumeric: 'tabular-nums'
});

export const legLink = style({
  color: colour.accent,
  textDecoration: 'none',
  fontWeight: fontWeight.semibold,
  selectors: { '&:hover': { textDecoration: 'underline' } }
});

export const legNote = style({
  color: colour.textSecondary
});

export const legFlags = style({
  color: colour.investigateText,
  fontVariantNumeric: 'tabular-nums'
});

export const compareLink = style({
  color: colour.accent,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  selectors: { '&:hover': { textDecoration: 'underline' } }
});
