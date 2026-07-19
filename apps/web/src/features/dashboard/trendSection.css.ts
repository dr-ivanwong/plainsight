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

export const section = style({
  marginTop: space[40],
  display: 'flex',
  flexDirection: 'column',
  gap: space[16]
});

export const heading = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

/** Small multiples share the width equally; below 600px they stack (dashboard design plan §6.2). */
export const chartRow = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  '@media': {
    'screen and (min-width: 600px)': {
      flexDirection: 'row'
    }
  }
});

export const chartCell = style({
  margin: 0,
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const chartLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const chartFrame = style({
  width: '100%'
});

/** Suspense placeholder at the chart's exact height: no layout shift when it lands. */
export const chartGhost = style({
  height: '160px'
});

/** A metric with under two computed years states its latest value in words instead of plotting. */
export const chartEmpty = style({
  margin: 0,
  paddingTop: space[8],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const scroller = style({
  width: '100%',
  overflowX: 'auto'
});

export const table = style({
  width: '100%',
  borderCollapse: 'collapse'
});

export const metricColHead = style({
  textAlign: 'left',
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: 'inherit',
  color: colour.textSecondary,
  padding: `${space[8]} ${space[16]} ${space[8]} 0`,
  verticalAlign: 'bottom'
});

export const yearHead = style({
  textAlign: 'right',
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: 'inherit',
  color: colour.textSecondary,
  padding: `${space[8]} ${space[8]}`,
  verticalAlign: 'bottom',
  fontVariantNumeric: 'tabular-nums'
});

export const metricRowHead = style({
  textAlign: 'left',
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: 'inherit',
  color: colour.textSecondary,
  padding: `${space[8]} ${space[16]} ${space[8]} 0`,
  borderTop: `${hairline} solid ${colour.border}`,
  whiteSpace: 'nowrap'
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

/** The metric sheet's idiom (metricSheet.css.ts): a quiet link-shaped toggle beneath the trend. */
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

/** The codebase's visually-hidden idiom (segmentedControl.css.ts): present to the accessibility tree only. */
export const srOnly = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  clipPath: 'inset(50%)',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
});
