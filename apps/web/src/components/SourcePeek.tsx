import type { ReactElement } from 'react';

import * as styles from './sourcePeek.css';

export type SourcePeekState =
  | { kind: 'loading' }
  | { kind: 'ready'; image: string }
  | { kind: 'unavailable' };

/**
 * The source page beside the extracted grid (frontend spec §5): the printed
 * page a field's provenance names, rendered from the uploaded PDF itself.
 * Loading and unavailable are designed states, in words; the reviewer is
 * never left staring at a hole.
 */
export function SourcePeek({
  fileName,
  page,
  state,
  onClose
}: {
  fileName: string;
  page: number;
  state: SourcePeekState;
  onClose: () => void;
}): ReactElement {
  return (
    <aside className={styles.peek} aria-label={`Source page ${page}`}>
      <div className={styles.head}>
        <span className={styles.caption}>
          Page {page} · {fileName}
        </span>
        <button type="button" className={styles.close} aria-label="Close the source peek" onClick={onClose}>
          ✕
        </button>
      </div>
      {state.kind === 'loading' ? <p className={styles.note}>Rendering the page…</p> : null}
      {state.kind === 'ready' ? (
        <img className={styles.image} src={state.image} alt={`Page ${page} of ${fileName}`} />
      ) : null}
      {state.kind === 'unavailable' ? (
        <p className={styles.note}>
          This page could not be rendered from the PDF. The figure and its confidence still stand;
          only the picture is missing.
        </p>
      ) : null}
    </aside>
  );
}
