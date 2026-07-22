import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { db, setMeta } from '../db';
import { needsInstallExplainer } from '../features/library/iosInstall';
import { Library } from '../features/library/Library';
import { LibrarySkeleton } from '../features/library/LibrarySkeleton';
import { loadSampleData } from '../features/library/loadSamples';
import { useCompanies } from '../hooks/useCompanies';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSyncStatus } from '../sync/useSync';

const librarySearchSchema = z.object({
  add: z.literal(1).optional().catch(undefined),
  import: z.literal(1).optional().catch(undefined)
});

// The library route (frontend spec §1.1), root of the stack. The add-company
// and ticker-import sheets encode in `?add=1` / `?import=1` so the system
// back gesture closes the sheet instead of exiting the screen.
export const Route = createFileRoute('/')({
  validateSearch: librarySearchSchema,
  component: LibraryScreen
});

function LibraryScreen(): ReactElement | null {
  const companies = useCompanies();
  const { add, import: importParam } = Route.useSearch();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  // Read raw: the queriers must stay pure, and a malformed row simply means
  // the note shows again.
  const bannerDismissed =
    useLiveQuery(() => db.meta.get('sampleBannerDismissed'), [])?.value === true;
  const iosDismissed =
    useLiveQuery(() => db.meta.get('iosInstallDismissed'), [])?.value === true;
  const syncSnapshot = useSyncStatus();
  const signedIn = useLiveQuery(async () => (await db.meta.get('authSession')) !== undefined, []);
  const hasSynced = useLiveQuery(async () => (await db.meta.get('lastSyncedAt')) !== undefined, []);

  // First render only, while the live queries attach; milliseconds, so no
  // loading state (frontend spec §3).
  if (companies === undefined || signedIn === undefined || hasSynced === undefined) return null;

  // The first catch-up (frontend spec §3, the library screen): an empty cache on a signed-in
  // device that has never synced is not yet a true-empty library. Hold the
  // screen until the first pull lands or fails; a failure serves the cache,
  // which is what catch-up mode means (main plan §12.9).
  if (
    companies.length === 0 &&
    signedIn &&
    !hasSynced &&
    (syncSnapshot.running || !syncSnapshot.settled)
  ) {
    return <LibrarySkeleton />;
  }

  return (
    <Library
      companies={companies}
      addOpen={add === 1}
      onAddOpen={() => void navigate({ to: '/', search: { add: 1 } })}
      onAddClose={() => void navigate({ to: '/', search: {}, replace: true })}
      importOpen={importParam === 1}
      onImportOpen={() => void navigate({ to: '/', search: { import: 1 } })}
      onImportClose={() => void navigate({ to: '/', search: {}, replace: true })}
      onImportToManual={() => void navigate({ to: '/', search: { add: 1 }, replace: true })}
      online={online}
      onSample={() => void loadSampleData()}
      showSampleBanner={!bannerDismissed && companies.some((company) => company.sample)}
      onSampleBannerDismiss={() => void setMeta(db, 'sampleBannerDismissed', true)}
      showInstallExplainer={!iosDismissed && needsInstallExplainer()}
      onInstallExplainerDismiss={() => void setMeta(db, 'iosInstallDismissed', true)}
    />
  );
}
