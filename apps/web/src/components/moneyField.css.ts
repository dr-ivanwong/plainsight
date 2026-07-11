import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontStack,
  hairline,
  radius,
  space,
  touchTarget,
  tracking
} from '../styles/tokens.css';

export const wrap = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: space[4],
  width: '100%'
});

/** Numbers align right in tabular figures; quiet until hovered or focused. */
export const input = style({
  width: '100%',
  minHeight: touchTarget,
  padding: `0 ${space[8]}`,
  textAlign: 'right',
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontVariantNumeric: 'tabular-nums',
  color: colour.textPrimary,
  backgroundColor: 'transparent',
  border: `${hairline} solid transparent`,
  borderRadius: radius.small,
  '::placeholder': {
    color: colour.textSecondary
  },
  ':hover': {
    borderColor: colour.border
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const zeroChip = style({
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: 'auto',
  fontFamily: fontStack,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  backgroundColor: 'transparent',
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.full,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const menuButton = style({
  minWidth: touchTarget,
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  backgroundColor: 'transparent',
  color: colour.textSecondary,
  fontSize: fontSize.subhead,
  borderRadius: radius.small,
  cursor: 'pointer',
  opacity: 0,
  selectors: {
    [`${wrap}:hover &, ${wrap}:focus-within &`]: {
      opacity: 1
    }
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const menu = style({
  position: 'absolute',
  top: '100%',
  right: 0,
  zIndex: 2,
  minWidth: 'max-content',
  padding: space[4],
  backgroundColor: colour.surfaceElevated,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.medium
});

export const menuItem = style({
  display: 'block',
  width: '100%',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  textAlign: 'left',
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  color: colour.textPrimary,
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: radius.small,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: colour.surface
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});
