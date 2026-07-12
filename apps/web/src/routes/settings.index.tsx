import { createFileRoute } from '@tanstack/react-router';

import { SettingsScreen } from '../features/settings/SettingsScreen';

// Settings root (frontend spec §3): appearance, data and storage, about.
// The providers group joins with its own phase.
export const Route = createFileRoute('/settings/')({
  component: SettingsScreen
});
