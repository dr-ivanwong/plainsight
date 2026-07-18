import type { ReactElement } from 'react';

import * as styles from './library.css';

/**
 * The first catch-up (frontend spec §3, the library screen): a signed-in device that has
 * never synced holds the screen with placeholder rows while the first pull
 * is in flight, because an empty cache is not yet a true-empty library. The
 * rows are decoration; the status line carries the meaning.
 */
export function LibrarySkeleton(): ReactElement {
  return (
    <>
      <header className={styles.toolbar}>
        <h1 className={styles.title}>Library</h1>
      </header>
      <ul className={styles.rows} aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <li key={row} className={styles.skeletonRow}>
            <span className={styles.skeletonName} />
            <span className={styles.skeletonMeta} />
          </li>
        ))}
      </ul>
      <p className={styles.srOnly} role="status">
        Catching up with your library.
      </p>
    </>
  );
}
