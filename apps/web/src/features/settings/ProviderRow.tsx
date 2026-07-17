import { useState, type FormEvent, type ReactElement } from 'react';

import { db, deleteCredential, putCredential, type ProviderCredentialRecord } from '../../db';
import { runProbe, type ProbeResult } from './providerProbe';
import type { KeyedProvider } from './providers';
import * as styles from './providersScreen.css';

const PROBE_WORDS: Readonly<Record<ProbeResult, string>> = {
  direct: 'Direct',
  proxy: 'Via proxy',
  failed: 'Failed'
};

/**
 * One provider row (frontend spec §3): name, the pinned data-policy words,
 * and the key's whole life: add, mask, reveal, test, delete. The Test button
 * is the screen's one online-only affordance; the screen hides it offline
 * and shows the quiet pill instead.
 */
export function ProviderRow({
  provider,
  credential,
  online
}: {
  provider: KeyedProvider;
  credential: ProviderCredentialRecord | undefined;
  online: boolean;
}): ReactElement {
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [probe, setProbe] = useState<'idle' | 'probing' | ProbeResult>('idle');

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const key = String(new FormData(event.currentTarget).get('key') ?? '').trim();
    if (key === '') return;
    await putCredential(db, { providerId: provider.id, key });
    setAdding(false);
    setProbe('idle');
  }

  async function handleTest(): Promise<void> {
    if (credential === undefined) return;
    setProbe('probing');
    const rung = provider.rungs[0];
    setProbe(rung === undefined ? 'failed' : await runProbe(rung, credential.key));
  }

  async function handleDelete(): Promise<void> {
    await deleteCredential(db, provider.id);
    setRevealed(false);
    setProbe('idle');
  }

  return (
    <section className={styles.row} aria-label={provider.name}>
      <div className={styles.rowHead}>
        <span className={styles.name}>{provider.name}</span>
        <span className={styles.policy}>{provider.policyWords}</span>
      </div>

      {credential === undefined ? (
        adding ? (
          <form className={styles.addForm} onSubmit={(event) => void handleAdd(event)}>
            <input
              name="key"
              type="password"
              className={styles.keyInput}
              aria-label={`${provider.name} API key`}
              placeholder="Paste the API key"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className={styles.action}>
              Save
            </button>
            <button type="button" className={styles.action} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <div className={styles.keyLine}>
            <button
              type="button"
              className={styles.action}
              aria-label={`Add the ${provider.name} key`}
              onClick={() => setAdding(true)}
            >
              Add key
            </button>
          </div>
        )
      ) : (
        <div className={styles.keyLine}>
          {revealed ? (
            <span className={styles.revealedKey}>{credential.key}</span>
          ) : (
            <span className={styles.mask} aria-label="Key stored">
              ••••••••
            </span>
          )}
          <button
            type="button"
            className={styles.action}
            aria-label={`${revealed ? 'Hide' : 'Reveal'} the ${provider.name} key`}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
          {online ? (
            <button
              type="button"
              className={styles.action}
              aria-label={`Test the ${provider.name} key`}
              disabled={probe === 'probing'}
              onClick={() => void handleTest()}
            >
              Test
            </button>
          ) : null}
          {probe === 'idle' ? null : (
            <span className={styles.probeChip} role="status">
              {probe === 'probing' ? 'Testing…' : PROBE_WORDS[probe]}
            </span>
          )}
          <button
            type="button"
            className={styles.action}
            aria-label={`Delete the ${provider.name} key`}
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
        </div>
      )}
    </section>
  );
}
