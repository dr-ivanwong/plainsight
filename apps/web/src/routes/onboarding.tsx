import { createFileRoute } from '@tanstack/react-router';

import { FirstRun } from '../features/onboarding/FirstRun';

// First run (frontend spec §3). The root route redirects here on a true first
// launch; afterwards the welcome stays reachable by address (and later from
// the settings screen's about group).
export const Route = createFileRoute('/onboarding')({
  component: FirstRun
});
