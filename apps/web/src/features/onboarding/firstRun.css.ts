import { keyframes, style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontWeight,
  layout,
  lineHeight,
  motion,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

const appear = keyframes({
  from: { opacity: 0, transform: `translateY(${space[8]})` },
  to: { opacity: 1, transform: 'translateY(0)' }
});

export const screen = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[40],
  paddingTop: space[24]
});

export const top = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%'
});

export const dots = style({
  display: 'inline-flex',
  gap: space[8]
});

export const dot = style({
  width: space[8],
  height: space[8],
  borderRadius: radius.full,
  backgroundColor: colour.border
});

export const dotCurrent = style([
  dot,
  {
    backgroundColor: colour.accent
  }
]);

export const skip = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  border: 'none',
  backgroundColor: 'transparent',
  color: colour.textSecondary,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  borderRadius: radius.medium
});

export const pane = style({
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  textAlign: 'center'
});

export const paneBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16],
  maxWidth: layout.proseMax,
  animation: `${appear} ${motion.durationMedium} ${motion.spring}`,
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${appear} ${motion.reducedMotionFade}`,
      transform: 'none'
    }
  }
});

export const heading = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  color: colour.textPrimary
});

export const body = style({
  fontSize: fontSize.body,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const starts = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  width: '100%',
  maxWidth: layout.actionColumnMax
});
