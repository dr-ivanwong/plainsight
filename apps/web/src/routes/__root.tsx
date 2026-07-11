import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import * as styles from '../styles/shell.css';

export const Route = createRootRoute({
  component: RootShell,
  notFoundComponent: NotFound,
});

function RootShell(): ReactElement {
  return (
    <main className={styles.column}>
      <Outlet />
    </main>
  );
}

// Every URL is bookmarkable and relaunch-safe (frontend spec §1.1), so an
// address that matches nothing gets a way home rather than a dead end.
function NotFound(): ReactElement {
  return (
    <Placeholder title="Nothing at this address" note="That page does not exist.">
      <Link className={placeholderStyles.link} to="/">
        Back to the library
      </Link>
    </Placeholder>
  );
}
