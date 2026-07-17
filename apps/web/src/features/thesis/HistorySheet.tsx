import { useEffect, useState, type ReactElement } from 'react';

import { SheetShell } from '../../components/SheetShell';
import type { ThesisVersionRecord } from '../../db';
import * as styles from './historySheet.css';
import { deltaLabel, wordCount } from './versionWords';

/** The four pinned sections in display order, shared with the editor. */
const SECTION_LABELS: ReadonlyArray<{ key: 'business' | 'moat' | 'valuation' | 'kills'; label: string }> = [
  { key: 'business', label: 'Business' },
  { key: 'moat', label: 'Moat' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'kills', label: 'What kills it' }
];

/** `2026-07-17 14:32` in the reader's own clock; the date half follows the house date form. */
function savedAtLabel(savedAt: string): string {
  const when = new Date(savedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/**
 * The version-history sheet (frontend spec §3), addressed by `?history=1`.
 * The list names each snapshot by when it was saved and how its length moved
 * against the version before it; any version opens read-only, exactly as
 * saved, with the financials-snapshot indicator where one is attached.
 * History is append-only: nothing here edits, restores or deletes.
 */
export function HistorySheet({
  open,
  onClose,
  versions,
  serif
}: {
  open: boolean;
  onClose: () => void;
  /** Newest first, as the hook returns them; undefined while the query attaches, which renders as nothing rather than as emptiness. */
  versions: readonly ThesisVersionRecord[] | undefined;
  serif: boolean;
}): ReactElement {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  const listed = versions ?? [];

  // Deltas compare against the chronologically previous version, so walk the
  // list oldest-first and hand each row its predecessor's count.
  const counts = new Map<number, { count: number; previous: number | null }>();
  for (let index = listed.length - 1; index >= 0; index -= 1) {
    const version = listed[index];
    if (version === undefined) continue;
    const older = listed[index + 1];
    counts.set(version.id, {
      count: wordCount(version.sections),
      previous: older === undefined ? null : wordCount(older.sections)
    });
  }

  const selected = listed.find((version) => version.id === selectedId);

  return (
    <SheetShell open={open} onClose={onClose} label="Thesis history">
      <div className={styles.sheet}>
        <header className={styles.head}>
          <h2 className={styles.title}>History</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        {selected === undefined ? (
          versions === undefined ? null : versions.length === 0 ? (
            <p className={styles.emptyNote}>
              No versions yet. Saving one keeps the thesis as it stands, unchanged, for as long as
              you keep the library.
            </p>
          ) : (
            <ul className={styles.rows}>
              {listed.map((version) => {
                const words = counts.get(version.id);
                return (
                  <li key={version.id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => setSelectedId(version.id)}
                    >
                      <span className={styles.rowWhen}>{savedAtLabel(version.savedAt)}</span>
                      <span className={styles.rowMeta}>
                        {words === undefined ? null : deltaLabel(words.count, words.previous)}
                        {version.financialsSnapshot === undefined ? null : (
                          <span className={styles.snapshotChip}>financials</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <>
            <button type="button" className={styles.back} onClick={() => setSelectedId(null)}>
              ‹ All versions
            </button>
            <p className={styles.versionWhen}>
              Saved {savedAtLabel(selected.savedAt)}
              {selected.financialsSnapshot === undefined
                ? ''
                : ` · financials snapshot attached, ${selected.financialsSnapshot.years.length} ${
                    selected.financialsSnapshot.years.length === 1 ? 'year' : 'years'
                  }${selected.financialsSnapshot.price === undefined ? '' : ' and the price'}`}
            </p>
            <div className={styles.sections}>
              {SECTION_LABELS.map(({ key, label }) =>
                selected.sections[key] === '' ? null : (
                  <section key={key}>
                    <h3 className={styles.sectionLabel}>{label}</h3>
                    <p className={serif ? styles.bodySerif : styles.body}>{selected.sections[key]}</p>
                  </section>
                )
              )}
            </div>
          </>
        )}
      </div>
    </SheetShell>
  );
}
