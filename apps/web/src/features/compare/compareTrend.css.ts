import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  hairline,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const section = style({
  marginTop: space[40],
  display: 'flex',
  flexDirection: 'column',
  gap: space[16]
});

export const legend = style({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: space[16],
  rowGap: space[8],
  margin: 0,
  padding: 0,
  listStyle: 'none'
});

export const legendItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[8],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const legendDot = style({
  width: space[8],
  height: space[8],
  borderRadius: radius.full,
  flexShrink: 0
});

export const frame = style({
  width: '100%'
});

/** The S4 idiom (metricSheet.css.ts): a quiet link-shaped toggle beneath the trend. */
export const viewToggle = style({
  alignSelf: 'flex-start',
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.caption1,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const scroller = style({
  width: '100%',
  overflowX: 'auto'
});

export const table = style({
  width: '100%',
  borderCollapse: 'collapse'
});

export const yearHead = style({
  textAlign: 'left',
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: 'inherit',
  color: colour.textSecondary,
  padding: `${space[8]} ${space[16]} ${space[8]} 0`,
  borderTop: `${hairline} solid ${colour.border}`,
  fontVariantNumeric: 'tabular-nums'
});

export const companyHead = style({
  textAlign: 'right',
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  padding: `${space[8]} ${space[8]}`,
  verticalAlign: 'bottom'
});

export const cell = style({
  textAlign: 'right',
  padding: `${space[8]} ${space[8]}`,
  borderTop: `${hairline} solid ${colour.border}`,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

export const noData = style({
  color: colour.textSecondary,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption
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
