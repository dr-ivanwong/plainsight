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

export const sheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[16]
});

export const head = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16]
});

export const title = style({
  fontSize: fontSize.title3,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.display,
  lineHeight: lineHeight.display
});

export const close = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: touchTarget,
  minHeight: touchTarget,
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontSize: fontSize.body,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});

export const dropzone = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[8],
  padding: `${space[24]} ${space[16]}`,
  borderRadius: radius.large,
  border: `1px dashed ${colour.border}`,
  color: colour.textSecondary,
  fontSize: fontSize.subhead,
  textAlign: 'center'
});

export const dropzoneActive = style([
  dropzone,
  {
    borderColor: colour.accent,
    color: colour.textPrimary
  }
]);

export const fileName = style({
  fontSize: fontSize.subhead,
  fontWeight: fontWeight.semibold,
  color: colour.textPrimary,
  overflowWrap: 'anywhere'
});

export const browse = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
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

export const hiddenInput = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  clipPath: 'inset(50%)',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
});

export const error = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.investigate
});

export const groupLabel = style({
  fontSize: fontSize.caption1,
  fontWeight: fontWeight.semibold,
  letterSpacing: tracking.sectionLabel,
  textTransform: 'uppercase',
  color: colour.textSecondary
});

export const providerList = style({
  display: 'flex',
  flexDirection: 'column'
});

export const providerOption = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  minHeight: touchTarget,
  padding: `${space[8]} 0`,
  borderTop: `${hairline} solid ${colour.border}`,
  cursor: 'pointer'
});

export const providerName = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[8],
  fontSize: fontSize.subhead,
  color: colour.textPrimary
});

export const providerPolicy = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  textAlign: 'right'
});

export const confidentialRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  paddingTop: space[8]
});

export const confidentialText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4]
});

export const confidentialLabel = style({
  fontSize: fontSize.subhead,
  color: colour.textPrimary
});

export const confidentialNote = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary
});

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: space[12],
  paddingTop: space[8]
});

export const noKeys = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  lineHeight: lineHeight.body
});

export const noKeysLink = style({
  color: colour.accent,
  fontWeight: fontWeight.semibold,
  textDecoration: 'none',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});
