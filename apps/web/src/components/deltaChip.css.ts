import { style } from '@vanilla-extract/css';

import { colour, fontSize, tracking } from '../styles/tokens.css';

export const chip = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap'
});

// Direction colour (dashboard design plan §4.3): the text-grade variants keep
// 13px figures at the AA floor on every background the chip renders on.
export const chipHealthy = style([chip, { color: colour.healthyText }]);
export const chipInvestigate = style([chip, { color: colour.investigateText }]);
