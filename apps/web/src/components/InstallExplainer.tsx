import type { ReactElement } from 'react';

import * as styles from './installExplainer.css';

/**
 * The iOS install card (frontend spec §5): states the real reason plainly,
 * never modal, never nagging. Shown once on the library; the data screen can
 * bring it back.
 */
export function InstallExplainer({ onDismiss }: { onDismiss: () => void }): ReactElement {
  return (
    <aside className={styles.card} aria-label="Add to Home Screen">
      <p className={styles.body}>
        iOS deletes this app&apos;s data after 7 days of non-use unless it&apos;s added to your
        Home Screen. In Safari: Share, then Add to Home Screen.
      </p>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss the Home Screen note"
        onClick={onDismiss}
      >
        ✕
      </button>
    </aside>
  );
}
