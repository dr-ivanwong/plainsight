import { style } from '@vanilla-extract/css';

import { colour, focusRing, motion, touchTarget } from '../styles/tokens.css';

export const wrap = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  cursor: 'pointer'
});

/** Visually hidden; the label wraps the track, so the whole control is the target. */
export const input = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  clipPath: 'inset(50%)',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
});

export const track = style({
  position: 'relative',
  width: '44px',
  height: '26px',
  borderRadius: '13px',
  backgroundColor: colour.border,
  transition: `background-color ${motion.durationFast} ${motion.spring}`,
  selectors: {
    [`${input}:checked ~ &`]: {
      backgroundColor: colour.accentFill
    },
    [`${input}:focus-visible ~ &`]: {
      outline: `${focusRing.width} solid ${colour.accent}`,
      outlineOffset: focusRing.offset
    }
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: `background-color ${motion.reducedMotionFade}`
    }
  }
});

export const knob = style({
  position: 'absolute',
  top: '3px',
  left: '3px',
  width: '20px',
  height: '20px',
  borderRadius: '10px',
  backgroundColor: colour.onAccent,
  transition: `transform ${motion.durationFast} ${motion.spring}`,
  selectors: {
    [`${input}:checked ~ ${track} &`]: {
      transform: 'translateX(18px)'
    }
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: `transform ${motion.reducedMotionFade}`
    }
  }
});
