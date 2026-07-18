import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  hairline,
  lineHeight,
  radius,
  railMedia,
  space,
  touchTarget,
  tracking
} from '../../styles/tokens.css';

export const chrome = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: space[16],
  marginBottom: space[24]
});

export const back = style({
  // At the rail breakpoint the rail owns wayfinding; this back affordance
  // duplicates one of its destinations, so it recedes.
  '@media': { [railMedia]: { display: 'none' } },
  justifySelf: 'start',
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

export const title = style({
  fontSize: fontSize.title2,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  marginBottom: space[32]
});

export const groupTitle = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  fontWeight: fontWeight.regular,
  color: colour.textSecondary,
  marginBottom: space[8]
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  minHeight: touchTarget,
  padding: `${space[8]} 0`,
  borderTop: `${hairline} solid ${colour.border}`,
  selectors: {
    '&:first-of-type': {
      borderTop: 'none'
    }
  }
});

export const rowLink = style([
  row,
  {
    textDecoration: 'none',
    borderRadius: radius.medium,
    ':focus-visible': {
      outline: `${focusRing.width} solid ${colour.accent}`,
      outlineOffset: 0
    }
  }
]);

export const rowText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const rowLabel = style({
  fontSize: fontSize.body,
  color: colour.textPrimary
});

export const rowNote = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const chevron = style({
  fontSize: fontSize.body,
  color: colour.textSecondary
});

// The quiet text button the sync row uses (the job strip's pattern).
export const actionButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.accent,
  fontFamily: 'inherit',
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});
