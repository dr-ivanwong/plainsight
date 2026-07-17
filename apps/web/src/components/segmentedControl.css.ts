import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  radius,
  space,
  touchTarget
} from '../styles/tokens.css';

export const group = style({
  display: 'inline-flex',
  gap: space[4],
  padding: space[4],
  backgroundColor: colour.surface,
  borderRadius: radius.medium
});

/** The many-option variant (the compare trend's twelve measures): segments flow onto new lines. */
export const groupWrap = style([group, { flexWrap: 'wrap' }]);

export const segment = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[16]}`,
  borderRadius: radius.small,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary,
  cursor: 'pointer',
  userSelect: 'none',
  selectors: {
    '&:has(input:focus-visible)': {
      outline: `${focusRing.width} solid ${colour.accent}`,
      outlineOffset: 0
    }
  }
});

export const segmentActive = style([
  segment,
  {
    backgroundColor: colour.surfaceElevated,
    color: colour.textPrimary,
    fontWeight: fontWeight.semibold
  }
]);

/** Visually hidden; the label carries the look, the radio carries the behaviour. */
export const radio = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  clipPath: 'inset(50%)',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
});
