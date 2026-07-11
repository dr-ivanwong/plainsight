import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import { entrySearchSchema } from './-search';

// Data entry (frontend spec §3). The search params are the pinned deep-link
// format (data-model spec §10): insufficient-data cards land on the first
// missing item via `?stmt=&fy=&focus=`.
export const Route = createFileRoute('/company/$id/entry')({
  validateSearch: entrySearchSchema,
  component: DataEntry
});

function DataEntry(): ReactElement {
  const { id } = Route.useParams();
  const { stmt, fy, focus } = Route.useSearch();
  const target = [
    stmt === undefined ? '' : ` Statement: ${stmt}.`,
    fy === undefined ? '' : ` Year: ${fy}.`,
    focus === undefined ? '' : ` Focus: ${focus}.`
  ].join('');
  return (
    <Placeholder
      title="Data entry"
      note={`Company ${id}.${target} The entry grid lands later in this phase.`}
    />
  );
}
