import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontWeight,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../styles/tokens.css';

const banner = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  borderLeftWidth: space[4],
  borderLeftStyle: 'solid'
});

/** Orange asks for a look; red asks for it sooner (data-model spec §7 severities). */
export const orange = style([banner, { borderLeftColor: colour.investigate }]);
export const red = style([banner, { borderLeftColor: colour.flag }]);

export const muted = style({
  opacity: 0.6
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16]
});

export const name = style({
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold,
  color: colour.textPrimary
});

export const action = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const fired = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});

export const body = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textPrimary
});

export const checkWord = style({
  color: colour.textSecondary
});
