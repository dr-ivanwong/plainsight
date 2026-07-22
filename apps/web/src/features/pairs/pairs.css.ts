import { style } from '@vanilla-extract/css';

import { colour, fontSize, fontWeight, radius, space, tracking } from '../../styles/tokens.css';

export const screen = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[32],
  paddingBottom: space[64]
});

export const title = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  margin: 0
});

export const sectionTitle = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  margin: 0,
  marginBottom: space[8]
});

export const provenance = style({
  margin: 0,
  marginTop: space[8],
  fontSize: fontSize.subhead,
  color: colour.textSecondary
});

export const figure = style({
  fontVariantNumeric: 'tabular-nums',
  color: colour.textPrimary
});

export const caption = style({
  margin: 0,
  marginTop: space[8],
  marginBottom: space[12],
  fontSize: fontSize.caption1,
  color: colour.textSecondary,
  maxWidth: '620px'
});

export const quiet = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary
});

export const retry = style({
  padding: `${space[8]} ${space[16]}`,
  borderRadius: radius.medium,
  border: 'none',
  backgroundColor: colour.accentFill,
  color: colour.onAccent,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer'
});

/** Present for assistive technology, absent from the visual layout. */
export const visuallyHidden = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0
});
