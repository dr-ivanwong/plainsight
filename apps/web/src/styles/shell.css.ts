import { style } from '@vanilla-extract/css';

import { layout, space } from './tokens.css';

const base = style({
  margin: '0 auto',
  padding: `${space[48]} ${space[20]} ${space[64]}`,
});

/** The single centred column every screen renders in (frontend spec §1.2). */
export const column = style([base, { maxWidth: layout.columnMax }]);

/** The wider column the dashboard and compare screens use (frontend spec §7). */
export const columnWide = style([base, { maxWidth: layout.columnWideMax }]);
