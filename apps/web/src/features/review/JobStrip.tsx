import type { ReactElement } from 'react';

import { retryJob, type ExtractionJob } from './jobStore';
import * as styles from './jobStrip.css';

const UNREADABLE_WORDS: Readonly<Record<string, string>> = {
  scanned_document:
    'This PDF is a scan with no text layer. Extraction reads born-digital reports; the figures need entering by hand for now.',
  statements_not_found: 'Could not find the financial statements in this PDF.',
  rasteriser_required: 'This report needs its pages rendered as images, and the renderer was unavailable.'
};

/**
 * The extraction job's honest voice on the entry screen (frontend spec §3):
 * stage labels while it runs, the provider error spoken plainly on failure
 * with the next ladder rung offered by name, and the typed refusals in
 * words. A live region announces every change. A finished job never lands
 * here: review mode takes the layout over the moment one succeeds.
 */
export function JobStrip({
  job,
  onDismiss
}: {
  job: ExtractionJob;
  onDismiss: () => void;
}): ReactElement {
  return (
    <section className={styles.strip} role="status" aria-label="Extraction">
      {job.phase === 'reading' ? <p className={styles.line}>Reading pages…</p> : null}

      {job.phase === 'extracting' ? (
        <p className={styles.line}>
          {job.rung === null ? 'Choosing a model…' : `Mapping line items with ${job.rung}…`}
        </p>
      ) : null}

      {job.phase === 'unreadable' ? (
        <>
          <p className={styles.line}>{UNREADABLE_WORDS[job.reason]}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      ) : null}

      {job.phase === 'failed' ? (
        <>
          <p className={styles.line}>{job.detail}</p>
          <div className={styles.actions}>
            {job.nextRung === null ? null : (
              <button type="button" className={styles.action} onClick={() => retryJob(job.id)}>
                Try {job.nextRung.label}
              </button>
            )}
            <button type="button" className={styles.action} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      ) : null}

    </section>
  );
}
