import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';

// First run (frontend spec §3): three panes, skippable, shown once. The
// true-first-launch redirect into this route lands with the onboarding slice.
export const Route = createFileRoute('/onboarding')({
  component: FirstRun
});

function FirstRun(): ReactElement {
  return (
    <Placeholder title="First run" note="The three-pane welcome lands later in this phase." />
  );
}
