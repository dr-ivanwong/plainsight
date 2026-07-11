import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { db, getMeta } from '../db';
import { Library } from '../features/library/Library';
import { useCompanies } from '../hooks/useCompanies';

const librarySearchSchema = z.object({
  add: z.literal(1).optional().catch(undefined)
});

// The library route (frontend spec §1.1), root of the stack. The add-company
// sheet encodes in `?add=1` so the system back gesture closes the sheet
// instead of exiting the screen.
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
  const { add } = Route.useSearch();
  const navigate = useNavigate();

  // First render only, while the live query attaches; milliseconds, so no
  // loading state (frontend spec §3).
  if (companies === undefined) return null;

  return (
    <Library
      companies={companies}
      addOpen={add === 1}
      onAddOpen={() => void navigate({ to: '/', search: { add: 1 } })}
      onAddClose={() => void navigate({ to: '/', search: {}, replace: true })}
    />
  );
}
