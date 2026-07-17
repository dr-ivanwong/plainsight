import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';

import { ToggleSwitch } from '../../components/ToggleSwitch';
import {
  assembleFinancials,
  db,
  financialsSnapshotSchema,
  putThesisDraft,
  saveThesisVersion,
  setMeta,
  type CompanyRecord,
  type ThesisRecord,
  type ThesisSections
} from '../../db';
import { usePrice } from '../../hooks/usePrice';
import { useStatements } from '../../hooks/useStatements';
import { useThesisVersions } from '../../hooks/useThesisVersions';
import * as buttons from '../../styles/buttons.css';
import { HistorySheet } from './HistorySheet';
import * as styles from './thesis.css';
import { wordCount } from './versionWords';

/** How long the keyboard rests before the draft commits; a blur commits at once. */
const AUTOSAVE_REST_MS = 900;

export const EMPTY_SECTIONS: ThesisSections = {
  business: '',
  moat: '',
  valuation: '',
  kills: ''
};

/** The four pinned sections (frontend spec §3); empty sections show their prompt question, never lorem. */
const SECTIONS: ReadonlyArray<{ key: keyof ThesisSections; label: string; prompt: string }> = [
  {
    key: 'business',
    label: 'Business',
    prompt: 'What does this business sell, who buys it, and why do they come back?'
  },
  {
    key: 'moat',
    label: 'Moat',
    prompt: 'What keeps competitors from taking these economics?'
  },
  {
    key: 'valuation',
    label: 'Valuation',
    prompt: 'What is the business worth, and what does the price assume?'
  },
  {
    key: 'kills',
    label: 'What kills it',
    prompt: 'What would have to be true for this thesis to be wrong?'
  }
];

/** The ticker's whole vocabulary; one quiet channel for both kinds of save. */
const TICKER_TEXT = {
  draft: { ok: 'Saved · just now', failed: 'Could not save. The text is not stored.' },
  version: { ok: 'Version saved · just now', failed: 'Could not save the version.' }
} as const;

/**
 * The thesis editor (frontend spec §3): four structured sections,
 * distraction-free, an optional serif body. Keystrokes stay local; the draft
 * commits after a short rest and on every blur, with the quiet ticker the
 * only feedback (frontend spec §2). A version is an explicit act: saving one
 * appends to the immutable history, carrying the financials snapshot when
 * the toggle is on, and `?history=1` opens the list.
 */
export function ThesisScreen({
  company,
  thesis,
  historyOpen,
  onHistoryOpen,
  onHistoryClose
}: {
  company: CompanyRecord;
  thesis: ThesisRecord | null;
  historyOpen: boolean;
  onHistoryOpen: () => void;
  onHistoryClose: () => void;
}): ReactElement {
  const baseId = useId();
  const [draft, setDraft] = useState<ThesisSections>(() => thesis?.sections ?? EMPTY_SECTIONS);
  const [status, setStatus] = useState<{ kind: keyof typeof TICKER_TEXT; ok: boolean } | null>(
    null
  );
  const [attach, setAttach] = useState(true);
  const lastSaved = useRef(JSON.stringify(thesis?.sections ?? EMPTY_SECTIONS));
  const serif = useLiveQuery(() => db.meta.get('thesisSerif'), [])?.value === true;
  const statements = useStatements(company.id);
  const price = usePrice(company.id);
  const versions = useThesisVersions(company.id);

  const commit = useCallback(
    async (sections: ThesisSections) => {
      const fingerprint = JSON.stringify(sections);
      if (fingerprint === lastSaved.current) return;
      try {
        await putThesisDraft(db, company.id, sections);
        lastSaved.current = fingerprint;
        setStatus({ kind: 'draft', ok: true });
      } catch {
        setStatus({ kind: 'draft', ok: false });
      }
    },
    [company.id]
  );

  useEffect(() => {
    const timer = setTimeout(() => void commit(draft), AUTOSAVE_REST_MS);
    return () => clearTimeout(timer);
  }, [draft, commit]);

  // The snapshot is the engine's own input, assembled from what is stored
  // right now; with no years there is nothing to attach and the toggle rests.
  const loaded = statements !== undefined && price !== undefined;
  const assembled = loaded ? assembleFinancials(company, statements, price) : null;
  const canAttach = assembled !== null && assembled.years.length > 0;

  async function handleSaveVersion(): Promise<void> {
    try {
      const financialsSnapshot =
        attach && canAttach && assembled !== null
          ? financialsSnapshotSchema.parse(assembled)
          : undefined;
      await saveThesisVersion(db, {
        companyId: company.id,
        sections: draft,
        ...(financialsSnapshot === undefined ? {} : { financialsSnapshot })
      });
      lastSaved.current = JSON.stringify(draft);
      setStatus({ kind: 'version', ok: true });
    } catch {
      setStatus({ kind: 'version', ok: false });
    }
  }

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/company/$id" params={{ id: company.id }} className={styles.back}>
          ‹ {company.name}
        </Link>
        <h1 className={styles.title}>Thesis</h1>
        <p role="status" className={status !== null && !status.ok ? styles.tickerError : styles.ticker}>
          {status === null ? '' : TICKER_TEXT[status.kind][status.ok ? 'ok' : 'failed']}
        </p>
      </header>

      <div className={styles.sections}>
        {SECTIONS.map(({ key, label, prompt }) => (
          <section key={key} className={styles.section}>
            <label className={styles.label} htmlFor={`${baseId}-${key}`}>
              {label}
            </label>
            <textarea
              id={`${baseId}-${key}`}
              className={serif ? styles.bodySerif : styles.body}
              value={draft[key]}
              placeholder={prompt}
              rows={4}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [key]: event.target.value }))
              }
              onBlur={() => void commit(draft)}
            />
          </section>
        ))}
      </div>

      <div className={styles.saveRow}>
        <button
          type="button"
          className={buttons.secondaryAction}
          disabled={!loaded || wordCount(draft) === 0}
          onClick={() => void handleSaveVersion()}
        >
          Save a version
        </button>
        {canAttach ? (
          <span className={styles.attachRow}>
            Attach today&apos;s financials
            <ToggleSwitch label="Attach today's financials" checked={attach} onChange={setAttach} />
          </span>
        ) : null}
      </div>

      <p className={styles.footer}>
        <button type="button" className={styles.historyLink} onClick={onHistoryOpen}>
          History
        </button>
        <span className={styles.footerSpacer} />
        Serif text
        <ToggleSwitch
          label="Serif text"
          checked={serif}
          onChange={(next) => void setMeta(db, 'thesisSerif', next)}
        />
      </p>

      <HistorySheet open={historyOpen} onClose={onHistoryClose} versions={versions} serif={serif} />
    </>
  );
}
