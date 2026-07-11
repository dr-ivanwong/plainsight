import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import * as styles from '../styles/shell.css';

export const Route = createRootRoute({
  component: RootShell,
  notFoundComponent: NotFound,
});

/** Screens that render in the wider column (frontend spec §7): the dashboard now, compare later. */
const WIDE_ROUTE_IDS: readonly string[] = ['/company/$id/'];

function RootShell(): ReactElement {
  const wide = useRouterState({
    select: (state) => state.matches.some((match) => WIDE_ROUTE_IDS.includes(match.routeId)),
  });
  return (
    <main className={wide ? styles.columnWide : styles.column}>
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
