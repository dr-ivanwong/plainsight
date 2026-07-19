import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const row = style({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: space[24],
  rowGap: space[12],
  marginBottom: space[24]
});

/** One headline figure; wraps two-by-two below 600px (dashboard design plan §5.3). */
export const stat = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  minHeight: touchTarget,
  textDecoration: 'none',
  borderRadius: radius.medium,
  flex: '1 1 40%',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  },
  '@media': {
    'screen and (min-width: 600px)': {
      flex: '0 1 auto'
    }
  }
});

export const statLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});
