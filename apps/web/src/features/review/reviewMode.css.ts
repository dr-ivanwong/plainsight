import { style } from '@vanilla-extract/css';

import {
  colour,
  fontSize,
  fontStack,
  fontWeight,
  focusRing,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const banner = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  padding: space[16],
  marginBottom: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  border: `${hairline} solid ${colour.border}`
});

export const bannerLine = style({
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  lineHeight: lineHeight.body
});

export const bannerName = style({
  fontWeight: fontWeight.semibold
});

export const warning = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: space[12],
  marginBottom: space[16]
});

export const quietAction = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const gateLine = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.investigate,
  marginTop: space[8]
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: space[12],
  marginTop: space[24]
});

export const holdup = style({
  flex: 1,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  lineHeight: lineHeight.body
});

export const edited = style({
  display: 'inline-flex',
  marginTop: space[4],
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const cellExtras = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[8]
});

/** Jump-to-source (frontend spec §3): the printed page a field's provenance names. */
export const pageRef = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: space[4],
  padding: `0 ${space[4]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.small,
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  fontVariantNumeric: 'tabular-nums',
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

/** The grid alone, and the grid beside the source page once a peek opens (frontend spec §3). */
export const layout = style({
  display: 'block'
});

export const layoutWithPeek = style({
  display: 'grid',
  gap: space[16],
  gridTemplateColumns: '1fr',
  '@media': {
    'screen and (min-width: 900px)': {
      gridTemplateColumns: 'minmax(260px, 340px) 1fr',
      alignItems: 'start'
    }
  }
});

export const peekPane = style({
  '@media': {
    'screen and (min-width: 900px)': {
      position: 'sticky',
      top: space[16]
    }
  }
});
