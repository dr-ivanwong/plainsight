import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import { dashboardSearchSchema } from './-search';

// The company dashboard (frontend spec §3); `?metric=` addresses the metric
// detail sheet, so the sheet survives bookmarks and PWA relaunch.
export const Route = createFileRoute('/company/$id/')({
  validateSearch: dashboardSearchSchema,
  component: CompanyDashboard
});

function CompanyDashboard(): ReactElement {
  const { id } = Route.useParams();
  const { metric } = Route.useSearch();
  const sheet = metric === undefined ? '' : ` Metric sheet: ${metric}.`;
  return (
    <Placeholder
      title="Company dashboard"
      note={`Company ${id}.${sheet} The dashboard lands later in this phase.`}
    />
  );
}
