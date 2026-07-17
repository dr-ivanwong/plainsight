import { createFileRoute } from '@tanstack/react-router';

import { ProvidersScreen } from '../features/settings/ProvidersScreen';

// Settings → Providers (frontend spec §1.1): the BYOK key screen.
export const Route = createFileRoute('/settings/providers')({
  component: ProvidersScreen
});
