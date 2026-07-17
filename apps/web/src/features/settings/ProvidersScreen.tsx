import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useProviderKeys } from '../../hooks/useProviderKeys';
import { ProviderRow } from './ProviderRow';
import { keyedProviders, provisionalLadder } from './providers';
import * as styles from './providersScreen.css';

/**
 * Settings → Providers (frontend spec §3): one row per key-owning provider
 * with the pinned data-policy words and the key's lifecycle, the escalation
 * order read-only beneath, and the key-hygiene copy as the footer. Offline,
 * the Test affordance hides and the quiet pill marks its absence (frontend
 * spec §2); everything else here works in airplane mode, because the keys
 * live in this device's storage and nowhere else.
 */
export function ProvidersScreen(): ReactElement | null {
  const online = useOnlineStatus();
  const credentials = useProviderKeys();

  // First render only, while the live query attaches (frontend spec §3).
  if (credentials === undefined) return null;

  const providers = keyedProviders();
  const byProvider = new Map(credentials.map((record) => [record.providerId, record]));

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/settings" className={styles.back}>
          ‹ Settings
        </Link>
        <h1 className={styles.title}>Providers</h1>
        {online ? (
          <span />
        ) : (
          <span
            className={styles.offlinePill}
            title="Key tests are available when online. Keys themselves live on this device."
          >
            Offline
          </span>
        )}
      </header>

      <div className={styles.rows}>
        {providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            credential={byProvider.get(provider.id)}
            online={online}
          />
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Escalation order</h2>
      <ol className={styles.ladder} aria-label="Escalation order, cheapest first">
        {provisionalLadder().map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ol>
      <p className={styles.note}>
        Cheapest first, and provisional: the bake-off pins the measured order, and reordering
        arrives with its scorecard.
      </p>

      <h2 className={styles.sectionTitle}>Key hygiene</h2>
      <p className={styles.note}>
        Keys stay in this device&apos;s storage and never leave it: not in exports, not in sync.
        Use a dedicated key for Plainsight, set a spend cap on the provider&apos;s side, and
        rotate the key if you lose this device.
      </p>
    </>
  );
}
