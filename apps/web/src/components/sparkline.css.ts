import { style } from '@vanilla-extract/css';

import { colour } from '../styles/tokens.css';

export const spark = style({
  display: 'block',
  width: '100%',
  height: '28px',
  color: colour.textSecondary
});

// The card's health signal, worn by line and fill through currentColor
// (dashboard design plan §4.4). The base semantic tokens serve directly: the
// planned spark aliases resolved to them, no new colours minted.
export const sparkHealthy = style([spark, { color: colour.healthy }]);
export const sparkInvestigate = style([spark, { color: colour.investigate }]);

export const line = style({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke'
});

/** Grounding under the line, not information (dashboard design plan §4.4). */
export const area = style({
  fill: 'currentColor',
  fillOpacity: 0.1,
  stroke: 'none'
});
