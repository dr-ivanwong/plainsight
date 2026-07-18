import { style } from '@vanilla-extract/css';

import { layout, railMedia, space } from './tokens.css';

const base = style({
  margin: '0 auto',
  padding: `${space[48]} ${space[20]} ${space[64]}`,
});

/** The single centred column every screen renders in (frontend spec §1.2). */
export const column = style([base, { maxWidth: layout.columnMax }]);

/** The wider column the dashboard and compare screens use (frontend spec §7). */
export const columnWide = style([base, { maxWidth: layout.columnWideMax }]);

/**
 * Company routes at desktop width (frontend spec §7, ≥1200px): the column
 * widens by exactly the section rail plus its gutter, so the content cell
 * beside the rail keeps the route's designed width to the pixel.
 */
const railExtra = `calc(${layout.railWidth} + ${space[24]})`;

export const columnRail = style([
  base,
  {
    maxWidth: layout.columnMax,
    '@media': {
      [railMedia]: { maxWidth: `calc(${layout.columnMax} + ${railExtra})` }
    }
  }
]);

export const columnWideRail = style([
  base,
  {
    maxWidth: layout.columnWideMax,
    '@media': {
      [railMedia]: {
        maxWidth: `calc(${layout.columnWideMax} + ${railExtra})`
      }
    }
  }
]);
