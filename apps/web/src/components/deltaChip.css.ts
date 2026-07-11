import { style } from '@vanilla-extract/css';

import { colour, fontSize, tracking } from '../styles/tokens.css';

export const chip = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});
