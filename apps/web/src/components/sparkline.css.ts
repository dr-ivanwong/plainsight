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
