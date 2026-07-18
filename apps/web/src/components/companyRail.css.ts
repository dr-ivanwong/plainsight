import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  layout,
  lineHeight,
  radius,
  railMedia,
  space,
  touchTarget,
  tracking
} from '../styles/tokens.css';

const desktop = railMedia;

/**
 * The company frame (frontend spec §1.2 amendment, ≥1200px): below the
 * breakpoint it contributes no box at all and the stack is untouched; at
 * desktop width it splits into the rail and a content cell whose width is
 * exactly the route's designed column.
 */
export const frame = style({
  display: 'contents',
  '@media': {
    [desktop]: {
      display: 'grid',
      gridTemplateColumns: `${layout.railWidth} minmax(0, 1fr)`,
      columnGap: space[24],
      alignItems: 'start'
    }
  }
});

export const rail = style({
  display: 'none',
  '@media': {
    [desktop]: {
      display: 'flex',
      flexDirection: 'column',
      gap: space[4],
      position: 'sticky',
      top: space[24]
    }
  }
});

const railLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.medium,
  textDecoration: 'none',
  fontSize: fontSize.subhead,
  ':hover': {
    backgroundColor: colour.surface
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const libraryLink = style([
  railLink,
  {
    color: colour.textSecondary,
    marginBottom: space[8]
  }
]);

export const name = style({
  padding: `0 ${space[12]}`,
  marginBottom: space[8],
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.caption,
  lineHeight: lineHeight.body,
  color: colour.textPrimary,
  overflowWrap: 'break-word'
});

export const sections = style({
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  margin: 0,
  padding: 0
});

export const section = style([
  railLink,
  {
    color: colour.textPrimary
  }
]);

export const sectionActive = style([
  railLink,
  {
    color: colour.accent,
    fontWeight: fontWeight.semibold,
    backgroundColor: colour.surface
  }
]);
