import { createFileRoute } from '@tanstack/react-router';

import { DataScreen } from '../features/settings/DataScreen';

// Data & storage (frontend spec §3): export, import, storage status, sample
// removal, quarantined records, and the danger zone.
export const Route = createFileRoute('/settings/data')({
  component: DataScreen
});
