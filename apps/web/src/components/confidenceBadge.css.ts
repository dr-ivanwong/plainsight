import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontWeight,
  hairline,
  radius,
  space,
  tracking
} from '../styles/tokens.css';

const chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: space[4],
  padding: `0 ${space[8]}`,
  borderRadius: radius.full,
  fontFamily: fontStack,
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

/** The mandatory band: below the confirm threshold, the chip is the gate. */
export const confirm = style([
  chip,
  {
    border: `1px solid ${colour.investigate}`,
    backgroundColor: 'transparent',
    color: colour.investigate,
    fontWeight: fontWeight.semibold
  }
]);

/** The amber band: caution worth a glance, acceptance optional. */
export const amber = style([
  chip,
  {
    border: `${hairline} solid ${colour.investigate}`,
    backgroundColor: 'transparent',
    color: colour.investigate
  }
]);

export const confirmed = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: space[4],
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});
