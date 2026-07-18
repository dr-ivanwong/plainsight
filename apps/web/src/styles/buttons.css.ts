import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontWeight,
  hairline,
  motion,
  press,
  radius,
  space,
  touchTarget
} from './tokens.css';

/** The shared action base: 44px target, spring press, designed focus ring (main plan §4). */
const action = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: touchTarget,
  minWidth: touchTarget,
  padding: `0 ${space[24]}`,
  borderRadius: radius.medium,
  border: 'none',
  fontFamily: fontStack,
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  transition: `transform ${motion.durationFast} ${motion.spring}`,
  ':active': {
    transform: `scale(${press.scale})`
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  },
  // A gated action rests visibly (review mode's Save while confirmations
  // wait); it never wears the accent it cannot honour.
  ':disabled': {
    cursor: 'default',
    transform: 'none'
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      // The press scale collapses to a quiet opacity fade (main plan §4).
      transition: `opacity ${motion.reducedMotionFade}`,
      ':active': {
        transform: 'none',
        opacity: press.reducedMotionOpacity
      }
    }
  }
});

export const primaryAction = style([
  action,
  {
    backgroundColor: colour.accentFill,
    color: colour.onAccent,
    ':disabled': {
      backgroundColor: colour.border,
      color: colour.textSecondary
    }
  }
]);

export const secondaryAction = style([
  action,
  {
    backgroundColor: colour.surface,
    color: colour.accent,
    boxShadow: `inset 0 0 0 ${hairline} ${colour.border}`,
    ':disabled': {
      color: colour.textSecondary
    }
  }
]);
