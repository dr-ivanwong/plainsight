import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import * as styles from '../styles/shell.css';

export const Route = createRootRoute({
  component: RootShell,
});

function RootShell(): ReactElement {
  return (
    <main className={styles.column}>
      <Outlet />
    </main>
  );
}
