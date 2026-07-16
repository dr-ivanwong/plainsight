import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  fontWeight,
  hairline,
  lineHeight,
  radius,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const chrome = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  marginBottom: space[16]
});

const chromeLink = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  borderRadius: radius.medium,
  color: colour.accent,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const back = chromeLink;
export const editData = chromeLink;

export const hero = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  marginBottom: space[24]
});

export const name = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const heroFacts = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  fontVariantNumeric: 'tabular-nums'
});

/**
 * Auto-fit below the wide breakpoint; four deterministic columns at it, wide
 * enough to seat the coming multi-year row (dashboard design plan §5.1,
 * frontend spec §7).
 */
export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: space[12],
  '@media': {
    'screen and (min-width: 900px)': {
      gridTemplateColumns: 'repeat(4, 1fr)'
    }
  }
});

/** The quiet all-caps group label, a full-width row of the card grid (dashboard design plan §3.3, §5.2). */
export const sectionLabel = style({
  gridColumn: '1 / -1',
  marginBottom: space[8],
  fontSize: fontSize.caption2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.sectionLabel,
  textTransform: 'uppercase',
  color: colour.textSecondary,
  selectors: {
    // Groups separate generously: with the uniform grid gap alone, a label
    // would sit closer to the previous group's cards than to its own.
    '&:not(:first-of-type)': {
      marginTop: space[24]
    }
  }
});

export const cardLink = style({
  display: 'block',
  textDecoration: 'none',
  borderRadius: radius.large,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const empty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[16],
  paddingTop: space[16]
});

export const emptyNote = style({
  fontSize: fontSize.body,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const priceCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[8],
  padding: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.large,
  border: `${hairline} solid ${colour.border}`,
  gridColumn: 'span 2'
});

export const priceTitle = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary
});

export const priceNote = style({
  fontSize: fontSize.subhead,
  lineHeight: lineHeight.body,
  color: colour.textSecondary
});

export const priceForm = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: space[12]
});

export const priceField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const priceLabel = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const priceInput = style({
  minHeight: touchTarget,
  width: '128px',
  padding: `0 ${space[12]}`,
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surfaceElevated,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const priceError = style({
  fontSize: fontSize.subhead,
  color: colour.flag
});

export const trendHint = style({
  marginTop: space[16],
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const flagSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[12],
  marginTop: space[40]
});

export const flagsHeading = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const dismissedToggle = style({
  alignSelf: 'flex-start',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});
