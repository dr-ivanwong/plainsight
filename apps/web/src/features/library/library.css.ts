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

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  marginBottom: space[24]
});

export const title = style({
  fontSize: fontSize.title1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const toolbarActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: space[8]
});

const toolbarControl = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.medium,
  border: 'none',
  backgroundColor: 'transparent',
  color: colour.accent,
  fontFamily: fontStack,
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const toolbarLink = toolbarControl;
export const addButton = toolbarControl;

export const filter = style({
  width: '100%',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  marginBottom: space[16],
  borderRadius: radius.small,
  border: `${hairline} solid ${colour.border}`,
  backgroundColor: colour.surface,
  color: colour.textPrimary,
  fontFamily: fontStack,
  fontSize: fontSize.body,
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const rows = style({
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  margin: 0,
  padding: 0
});

export const noMatches = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  padding: `${space[16]} 0`
});
