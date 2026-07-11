import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import { Dashboard } from '../features/dashboard/Dashboard';
import { useMetrics } from '../hooks/useMetrics';
import { dashboardSearchSchema } from './-search';

// The company dashboard (frontend spec §3); `?metric=` addresses the metric
// detail sheet, so the sheet survives bookmarks and the system back gesture
// closes it instead of leaving the screen.
export const Route = createFileRoute('/company/$id/')({
  validateSearch: dashboardSearchSchema,
  component: CompanyDashboard
});

function CompanyDashboard(): ReactElement | null {
  const { id } = Route.useParams();
  const { metric } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const metrics = useMetrics(id);

  if (metrics === undefined) return null;
  if (metrics === null) {
    return (
      <Placeholder title="No company at this address" note="It may have been removed.">
        <Link className={placeholderStyles.link} to="/">
          Back to the library
        </Link>
      </Placeholder>
    );
  }

  return (
    <Dashboard
      metrics={metrics}
      metric={metric}
      onMetricClose={() => void navigate({ search: {}, replace: true })}
    />
  );
}
