import type { ReactElement } from 'react';

import * as styles from './libraryEmpty.css';

/**
 * The Library's true-empty state (frontend spec §3): a one-line promise and
 * the two starting actions. The sample-data loader arrives with its own
 * slice; until then that button stays inert.
 */
export function LibraryEmpty({ onAdd, onSample }: { onAdd?: () => void; onSample?: () => void }): ReactElement {
  return (
    <section className={styles.hero}>
      <h2 className={styles.promise}>Read financial statements like an owner</h2>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryAction} onClick={onAdd}>
          Add a company
        </button>
        <button type="button" className={styles.secondaryAction} onClick={onSample}>
          See it with sample data
        </button>
      </div>
    </section>
  );
}
