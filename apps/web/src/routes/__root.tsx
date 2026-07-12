import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, type ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import { db } from '../db';
import * as styles from '../styles/shell.css';

export const Route = createRootRoute({
  component: RootShell,
  notFoundComponent: NotFound,
});

/** Screens that render in the wider column (frontend spec §7): the dashboard now, compare later. */
const WIDE_ROUTE_IDS: readonly string[] = ['/company/$id/'];

/**
 * Ask the browser to keep this origin's data, once per launch. Browsers
 * decide by their own heuristics and may silently decline; the data screen
 * shows the answer either way.
 */
function useRequestPersistence(): void {
  useEffect(() => {
    const storage = navigator.storage as StorageManager | undefined;
    if (storage !== undefined && typeof storage.persist === 'function') {
      void storage.persist();
    }
  }, []);
}

/**
 * The stored theme choice, applied to the document (tokens.css.ts): light or
 * dark outranks the system preference in either direction, and auto (or an
 * unreadable row) removes the attribute to hand control back to the system.
 */
function useAppliedTheme(): void {
  const themeRow = useLiveQuery(() => db.meta.get('theme'), []);
  const value = themeRow?.value;
  useEffect(() => {
    if (value === 'light' || value === 'dark') {
      document.documentElement.dataset.theme = value;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [value]);
}

function RootShell(): ReactElement {
  useRequestPersistence();
  useAppliedTheme();
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
