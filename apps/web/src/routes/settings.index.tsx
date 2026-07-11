import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';

// Settings root (frontend spec §3): appearance, data and storage, about.
export const Route = createFileRoute('/settings/')({
  component: SettingsRoot
});

function SettingsRoot(): ReactElement {
  return <Placeholder title="Settings" note="Settings land later in this phase." />;
}
