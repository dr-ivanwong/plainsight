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
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const sheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16],
  padding: space[24],
  maxHeight: '80dvh',
  overflowY: 'auto',
  '@media': {
    'screen and (max-width: 599px)': {
      maxHeight: '100dvh'
    }
  }
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16]
});

export const title = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const close = style({
  minWidth: touchTarget,
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontSize: fontSize.subhead,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const valueRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: space[12],
  flexWrap: 'wrap'
});

export const basisBadge = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.full,
  padding: `0 ${space[8]}`,
  whiteSpace: 'nowrap'
});

export const explainer = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const trend = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8]
});

export const viewToggle = style({
  alignSelf: 'flex-start',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const table = style({
  borderCollapse: 'collapse',
  width: '100%'
});

export const tableYear = style({
  textAlign: 'left',
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary,
  padding: `${space[4]} 0`,
  fontVariantNumeric: 'tabular-nums'
});

export const tableValue = style({
  textAlign: 'right',
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  padding: `${space[4]} 0`,
  fontVariantNumeric: 'tabular-nums'
});

export const block = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  paddingTop: space[8],
  borderTop: `${hairline} solid ${colour.border}`
});

export const blockTitle = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary
});

export const formula = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textPrimary,
  fontVariantNumeric: 'tabular-nums'
});

export const inputs = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const inputRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: space[8],
  flexWrap: 'wrap'
});

export const inputLabel = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  flexGrow: 1
});

export const inputValue = style({
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  fontVariantNumeric: 'tabular-nums'
});

export const sourceChip = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.full,
  padding: `0 ${space[8]}`,
  whiteSpace: 'nowrap'
});

// The chip that carries a filing URL: same quiet shape, accent text as the
// one navigation signal.
export const sourceLink = style([
  sourceChip,
  {
    color: colour.accent,
    textDecoration: 'none',
    ':focus-visible': {
      outline: `${focusRing.width} solid ${colour.accent}`,
      outlineOffset: focusRing.offset
    }
  }
]);

export const prose = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textPrimary
});

export const companion = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large
});

export const companionRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: space[16]
});

export const companionLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const companionValue = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  fontVariantNumeric: 'tabular-nums',
  color: colour.textPrimary
});

export const companionDetails = style({
  fontSize: fontSize.caption1,
  color: colour.textSecondary
});

export const companionSummary = style({
  cursor: 'pointer',
  minHeight: touchTarget,
  display: 'flex',
  alignItems: 'center'
});
