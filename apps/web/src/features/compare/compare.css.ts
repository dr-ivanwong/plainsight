import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontWeight,
  hairline,
  layout,
  lineHeight,
  motion,
  press,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const chrome = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  marginBottom: space[16]
});

export const back = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  borderRadius: radius.medium,
  color: colour.accent,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const hero = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  marginBottom: space[24]
});

export const title = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const hint = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary
});

export const chips = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: space[8],
  marginBottom: space[24]
});

export const chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[16]}`,
  borderRadius: radius.full,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surface,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  cursor: 'pointer',
  transition: `transform ${motion.durationFast} ${motion.spring}`,
  ':active': {
    transform: `scale(${press.scale})`
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  },
  // At the pick cap the rest quieten rather than vanish: the limit is
  // legible, and unpicking stays one tap away.
  ':disabled': {
    color: colour.textSecondary,
    cursor: 'default',
    transform: 'none'
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: `opacity ${motion.reducedMotionFade}`,
      ':active': {
        transform: 'none',
        opacity: press.reducedMotionOpacity
      }
    }
  }
});

export const chipSelected = style([
  chip,
  {
    borderColor: 'transparent',
    backgroundColor: colour.accentFill,
    color: colour.onAccent,
    fontWeight: fontWeight.semibold
  }
]);

export const currencyNote = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  marginBottom: space[16]
});

export const empty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[16],
  padding: `${space[24]} 0`
});

export const emptyNote = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  lineHeight: lineHeight.body,
  maxWidth: layout.proseMax
});
