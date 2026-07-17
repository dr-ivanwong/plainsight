import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';

import { ToggleSwitch } from '../../components/ToggleSwitch';
import {
  db,
  putThesisDraft,
  setMeta,
  type CompanyRecord,
  type ThesisRecord,
  type ThesisSections
} from '../../db';
import * as styles from './thesis.css';

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

/**
 * The thesis editor (frontend spec §3): four structured sections,
 * distraction-free, an optional serif body. Keystrokes stay local; the draft
 * commits after a short rest and on every blur, with the quiet ticker the
 * only feedback (frontend spec §2). Versioned snapshots and their history
 * sheet arrive with the next slice.
 */
export function ThesisScreen({
  company,
  thesis
}: {
  company: CompanyRecord;
  thesis: ThesisRecord | null;
}): ReactElement {
  const baseId = useId();
  const [draft, setDraft] = useState<ThesisSections>(() => thesis?.sections ?? EMPTY_SECTIONS);
  const [status, setStatus] = useState<{ ok: boolean } | null>(null);
  const lastSaved = useRef(JSON.stringify(thesis?.sections ?? EMPTY_SECTIONS));
  const serif = useLiveQuery(() => db.meta.get('thesisSerif'), [])?.value === true;

  const commit = useCallback(
    async (sections: ThesisSections) => {
      const fingerprint = JSON.stringify(sections);
      if (fingerprint === lastSaved.current) return;
      try {
        await putThesisDraft(db, company.id, sections);
        lastSaved.current = fingerprint;
        setStatus({ ok: true });
      } catch {
        setStatus({ ok: false });
      }
    },
    [company.id]
  );

  useEffect(() => {
    const timer = setTimeout(() => void commit(draft), AUTOSAVE_REST_MS);
    return () => clearTimeout(timer);
  }, [draft, commit]);

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/company/$id" params={{ id: company.id }} className={styles.back}>
          ‹ {company.name}
        </Link>
        <h1 className={styles.title}>Thesis</h1>
        <p role="status" className={status !== null && !status.ok ? styles.tickerError : styles.ticker}>
          {status === null ? '' : status.ok ? 'Saved · just now' : 'Could not save. The text is not stored.'}
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

      <p className={styles.footer}>
        Serif text
        <ToggleSwitch
          label="Serif text"
          checked={serif}
          onChange={(next) => void setMeta(db, 'thesisSerif', next)}
        />
      </p>
    </>
  );
}
