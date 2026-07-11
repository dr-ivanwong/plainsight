import { style } from '@vanilla-extract/css';

import { colour } from '../styles/tokens.css';

/** Axis text inherits this colour; the line itself carries the accent. */
export const frame = style({
  width: '100%',
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});
