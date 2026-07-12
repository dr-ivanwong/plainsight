import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { db, getMeta, setMeta } from '../db';
import { needsInstallExplainer } from '../features/library/iosInstall';
import { Library } from '../features/library/Library';
import { loadSampleData } from '../features/library/loadSamples';
import { useCompanies } from '../hooks/useCompanies';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const librarySearchSchema = z.object({
  add: z.literal(1).optional().catch(undefined),
  import: z.literal(1).optional().catch(undefined)
});

// The library route (frontend spec §1.1), root of the stack. The add-company
// and ticker-import sheets encode in `?add=1` / `?import=1` so the system
// back gesture closes the sheet instead of exiting the screen.
export const Route = createFileRoute('/')({
  validateSearch: librarySearchSchema,
  // A true first launch redirects to the welcome, once: the flag gates it
  // (frontend spec §3), and every later visit comes straight here.
  beforeLoad: async () => {
    if ((await getMeta(db, 'onboardingDone')) !== true) {
      throw redirect({ to: '/onboarding' });
    }
  },
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

  // First render only, while the live query attaches; milliseconds, so no
  // loading state (frontend spec §3).
  if (companies === undefined) return null;

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
