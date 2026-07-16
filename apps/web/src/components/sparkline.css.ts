import { style } from '@vanilla-extract/css';

import { colour } from '../styles/tokens.css';

export const spark = style({
  display: 'block',
  width: '100%',
  height: '28px',
  color: colour.textSecondary
});

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
