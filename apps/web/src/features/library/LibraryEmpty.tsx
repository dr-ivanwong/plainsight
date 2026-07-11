import type { ReactElement } from 'react';

import * as styles from './libraryEmpty.css';

/**
 * S2 Library, true-empty state (frontend spec §3): a one-line promise and the
 * two starting actions. The buttons are inert placeholders in Phase 0; Phase 1
 * wires them to company creation and the sample-data loader.
 */
export function LibraryEmpty(): ReactElement {
  return (
    <section className={styles.hero}>
      <h1 className={styles.promise}>Read financial statements like an owner</h1>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryAction}>
          Add a company
        </button>
        <button type="button" className={styles.secondaryAction}>
          See it with sample data
        </button>
      </div>
    </section>
  );
}
