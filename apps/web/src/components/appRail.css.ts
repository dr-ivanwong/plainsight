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

/**
 * The rail frame (frontend spec §1.2 amendment, ≥1200px): below the
 * breakpoint it contributes no box at all and the stack is untouched; at
 * desktop width it splits into the rail and a content cell whose width is
 * exactly the route's designed column.
 */
export const frame = style({
  display: 'contents',
  '@media': {
    [railMedia]: {
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
    [railMedia]: {
      display: 'flex',
      flexDirection: 'column',
      gap: space[4],
      position: 'sticky',
      top: space[24]
    }
  }
});

/** The open company's corner of the rail, beneath the destinations. */
export const companyGroup = style({
  marginTop: space[24],
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

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
