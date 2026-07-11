import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  hairline,
  layout,
  lineHeight,
  motion,
  press,
  radius,
  space,
  touchTarget,
  tracking,
} from '../../styles/tokens.css';

/** Hero empty state: the one-line promise, then the two starting actions. */
export const hero = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[32],
  paddingTop: space[64],
  textAlign: 'center',
});

export const promise = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  color: colour.textPrimary,
});

export const actions = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  width: '100%',
  maxWidth: layout.actionColumnMax,
});

const action = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: touchTarget,
  minWidth: touchTarget,
  padding: `0 ${space[24]}`,
  borderRadius: radius.medium,
  border: 'none',
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  transition: `transform ${motion.durationFast} ${motion.spring}`,
  ':active': {
    transform: `scale(${press.scale})`,
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset,
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      // The press scale collapses to a quiet opacity fade (main plan §4).
      transition: `opacity ${motion.reducedMotionFade}`,
      ':active': {
        transform: 'none',
        opacity: press.reducedMotionOpacity,
      },
    },
  },
});

export const primaryAction = style([
  action,
  {
    backgroundColor: colour.accentFill,
    color: colour.onAccent,
  },
]);

export const secondaryAction = style([
  action,
  {
    backgroundColor: colour.surface,
    color: colour.accent,
    boxShadow: `inset 0 0 0 ${hairline} ${colour.border}`,
  },
]);
