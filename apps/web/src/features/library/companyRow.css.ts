import { style } from '@vanilla-extract/css';

import {
  colour,
  focusRing,
  fontSize,
  fontWeight,
  hairline,
  radius,
  space,
  tracking
} from '../../styles/tokens.css';

/** 64px rows, separated by spacing rather than rules (frontend spec §3). */
export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[16],
  minHeight: '64px',
  padding: `${space[8]} ${space[16]}`,
  borderRadius: radius.medium,
  textDecoration: 'none',
  color: colour.textPrimary,
  ':hover': {
    backgroundColor: colour.surface
  },
  ':focus-visible': {
    outline: `${focusRing.width} solid ${colour.accent}`,
    outlineOffset: focusRing.offset
  }
});

export const identity = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: space[8],
  minWidth: 0
});

export const name = style({
  fontSize: fontSize.body,
  fontWeight: fontWeight.semibold,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

export const badge = style({
  fontSize: fontSize.caption1,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});

export const sampleChip = style({
  fontSize: fontSize.caption2,
  letterSpacing: tracking.caption,
  color: colour.textSecondary,
  border: `${hairline} solid ${colour.border}`,
  borderRadius: radius.full,
  padding: `0 ${space[8]}`,
  whiteSpace: 'nowrap'
});

export const updated = style({
  fontSize: fontSize.caption1,
  color: colour.textSecondary,
  whiteSpace: 'nowrap'
});
