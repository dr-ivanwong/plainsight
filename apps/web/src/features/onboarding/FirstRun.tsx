import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';

import { db, setMeta } from '../../db';
import { loadSampleData } from '../library/loadSamples';
import * as buttons from '../../styles/buttons.css';
import * as styles from './firstRun.css';

/**
 * First run (frontend spec §3): three panes, hard-capped, skippable, never
 * shown twice (the onboardingDone flag in meta gates the root redirect).
 * Pane three chooses the start and lands on the library in the corresponding
 * state; the import-a-file start carries its intent through the add sheet,
 * because a filing needs a company shell (name, currency) before it can
 * land anywhere.
 */
const PANES = [
  {
    heading: 'Read financial statements like an owner',
    body:
      "Plainsight reads a company's income statement, balance sheet and cash flow the way an " +
      'owner would: a dozen durable measures of profitability, resilience and value, each one ' +
      'traceable to the exact figures you entered. It explains; it never advises.'
  },
  {
    // The source-of-truth contract (main plan §12.9): a working copy on the
    // device, the durable copy behind sign-in, export as portability. A test
    // pins these claims so the copy cannot quietly outlive the architecture
    // again.
    heading: 'Where your data lives',
    body:
      'The app works offline against a copy kept on this device. Signing in, from Settings, ' +
      'gives the library its durable home on the server, and anything entered offline catches ' +
      'up when you reconnect. One tap exports the whole library to a file, any time.'
  },
  {
    heading: 'Choose your start',
    body: 'Begin with a company you know, or look around with real filings first.'
  }
] as const;

export function FirstRun(): ReactElement {
  const navigate = useNavigate();
  const [pane, setPane] = useState(0);
  const current = PANES[pane] ?? PANES[0];
  const lastPane = pane === PANES.length - 1;

  async function finish(
    search: { add: 1 } | { add: 1; upload: 1 } | Record<never, never>
  ): Promise<void> {
    await setMeta(db, 'onboardingDone', true);
    // Replace, so the system back gesture from the library leaves the app
    // rather than replaying the welcome.
    await navigate({ to: '/', search, replace: true });
  }

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <span className={styles.dots} aria-label={`Pane ${pane + 1} of ${PANES.length}`}>
          {PANES.map((entry, index) => (
            <span
              key={entry.heading}
              className={index === pane ? styles.dotCurrent : styles.dot}
            />
          ))}
        </span>
        <button
          type="button"
          className={styles.skip}
          onClick={() => void finish({})}
        >
          Skip
        </button>
      </header>

      <section className={styles.pane} aria-live="polite">
        <div key={current.heading} className={styles.paneBody}>
          <h1 className={styles.heading}>{current.heading}</h1>
          <p className={styles.body}>{current.body}</p>
        </div>
      </section>

      {lastPane ? (
        <div className={styles.starts}>
          <button
            type="button"
            className={buttons.primaryAction}
            autoFocus
            onClick={() => void finish({ add: 1 })}
          >
            Add a company
          </button>
          <button
            type="button"
            className={buttons.secondaryAction}
            onClick={() =>
              void (async () => {
                await loadSampleData();
                await finish({});
              })()
            }
          >
            See it with sample data
          </button>
          <button
            type="button"
            className={buttons.secondaryAction}
            onClick={() => void finish({ add: 1, upload: 1 })}
          >
            Import a file
          </button>
        </div>
      ) : (
        <div className={styles.starts}>
          <button
            type="button"
            className={buttons.primaryAction}
            onClick={() => setPane((index) => index + 1)}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
