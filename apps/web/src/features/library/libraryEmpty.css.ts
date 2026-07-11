import { style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontWeight,
  layout,
  lineHeight,
  space,
  tracking
} from '../../styles/tokens.css';

/** Hero empty state: the one-line promise, then the two starting actions. */
export const hero = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[32],
  paddingTop: space[64],
  textAlign: 'center'
});

export const promise = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display,
  color: colour.textPrimary
});

export const actions = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  width: '100%',
  maxWidth: layout.actionColumnMax
});
