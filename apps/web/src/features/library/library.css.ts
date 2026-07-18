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
  railMedia,
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

// At the rail breakpoint the rail carries Compare and Settings; the toolbar
// keeps its actions (Import, add) and hands navigation to the rail.
export const toolbarLink = style([
  toolbarControl,
  {
    '@media': {
      [railMedia]: { display: 'none' }
    }
  }
]);
export const addButton = toolbarControl;

/** The quiet offline marker (frontend spec §2): shown only where an online-only affordance was hidden. */
export const offlinePill = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: touchTarget,
  padding: `0 ${space[12]}`,
  borderRadius: radius.medium,
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  border: `${hairline} solid ${colour.border}`
});

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

/**
 * The library's first catch-up (frontend spec §3): quiet placeholder rows while a
 * signed-in device's first pull is in flight. Motionless by design; the
 * calm is the message.
 */
export const skeletonRow = style({
  minHeight: '64px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: space[8],
  padding: `${space[8]} ${space[16]}`
});

export const skeletonName = style({
  display: 'block',
  width: '45%',
  height: space[16],
  borderRadius: radius.small,
  backgroundColor: colour.surfaceHover
});

export const skeletonMeta = style({
  display: 'block',
  width: '25%',
  height: space[12],
  borderRadius: radius.small,
  backgroundColor: colour.surface
});

export const srOnly = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  clipPath: 'inset(50%)',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
});

export const noMatches = style({
  fontSize: fontSize.subhead,
  color: colour.textSecondary,
  padding: `${space[16]} 0`
});

export const sampleBanner = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[12],
  padding: `${space[4]} ${space[12]}`,
  marginBottom: space[16],
  backgroundColor: colour.surface,
  borderRadius: radius.medium,
  fontSize: fontSize.caption1,
  color: colour.textSecondary
});

export const sampleBannerLink = style({
  color: colour.accent,
  textDecoration: 'none',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const sampleBannerDismiss = style({
  minWidth: touchTarget,
  minHeight: touchTarget,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  backgroundColor: 'transparent',
  borderRadius: radius.medium,
  color: colour.textSecondary,
  fontSize: fontSize.caption1,
  cursor: 'pointer',
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: 0
  }
});
