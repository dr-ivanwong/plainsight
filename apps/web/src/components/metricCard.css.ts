import { style } from '@vanilla-extract/css';

import {
  colour,
  elevation,
  fontSize,
  fontWeight,
  motion,
  radius,
  space,
  tracking
} from '../styles/tokens.css';

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  minWidth: 0,
  // Depth per theme (dashboard design plan §4.1): the shadow resolves to none
  // in dark mode, where the hover brightness step is the cue instead.
  boxShadow: elevation.card,
  '@media': {
    // Hover is a pointer-device affordance; touch never sees a sticky lift.
    '(hover: hover)': {
      transition: `box-shadow ${motion.durationFast} ${motion.spring}, background-color ${motion.durationFast} ${motion.spring}`,
      ':hover': {
        boxShadow: elevation.cardHover,
        backgroundColor: colour.surfaceHover
      }
    },
    '(prefers-reduced-motion: reduce)': {
      // The lift still happens; it just snaps instead of animating.
      transition: 'none'
    }
  }
});

export const label = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[8],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary
});

/** The card-level health signal (dashboard design plan §4.2): a 6px dot at the label's trailing edge. */
const dot = style({
  width: '6px',
  height: '6px',
  borderRadius: radius.full,
  flexShrink: 0
});

export const dotHealthy = style([dot, { backgroundColor: colour.healthy }]);
export const dotInvestigate = style([dot, { backgroundColor: colour.investigate }]);

export const valueRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: space[8],
  flexWrap: 'wrap'
});

export const footnote = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});

/** Amber once the price is more than ninety days old (frontend spec §3). */
export const footnoteStale = style([
  footnote,
  {
    color: colour.investigate
  }
]);
