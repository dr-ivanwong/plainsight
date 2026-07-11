import { keyframes, style } from '@vanilla-extract/css';

import { colour, hairline, motion, radius, scrim, space } from '../styles/tokens.css';

const rise = keyframes({
  from: { opacity: 0, transform: `translateY(${space[8]})` },
  to: { opacity: 1, transform: 'translateY(0)' }
});

const fade = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 }
});

export const sheet = style({
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.large,
  padding: 0,
  width: `min(560px, calc(100vw - ${space[32]}))`,
  backgroundColor: colour.surfaceElevated,
  color: colour.textPrimary,
  selectors: {
    '&[open]': {
      animation: `${rise} ${motion.durationFast} ${motion.spring}`
    }
  },
  '::backdrop': {
    backgroundColor: scrim
  },
  '@media': {
    // Sheets go full screen on small viewports (frontend spec §7).
    'screen and (max-width: 599px)': {
      margin: 0,
      width: '100vw',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      borderRadius: 0,
      border: 'none'
    },
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        '&[open]': {
          animation: `${fade} ${motion.reducedMotionFade}`
        }
      }
    }
  }
});
