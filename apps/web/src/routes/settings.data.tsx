import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';

// Data & storage (frontend spec §3): export, import, storage status, sample
// removal, quarantined records, and the danger zone.
export const Route = createFileRoute('/settings/data')({
  component: DataAndStorage
});

function DataAndStorage(): ReactElement {
  return (
    <Placeholder
      title="Data & storage"
      note="Export, import and storage status land later in this phase."
    />
  );
}
