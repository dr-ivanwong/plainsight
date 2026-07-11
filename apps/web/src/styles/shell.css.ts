import { style } from '@vanilla-extract/css';

import { layout, space } from './tokens.css';

/** The single centred column every screen renders in (frontend spec §1.2). */
export const column = style({
  maxWidth: layout.columnMax,
  margin: '0 auto',
  padding: `${space[48]} ${space[20]} ${space[64]}`,
});
