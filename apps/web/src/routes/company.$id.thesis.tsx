import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import { ThesisScreen } from '../features/thesis/ThesisScreen';
import { useCompany } from '../hooks/useCompany';
import { useThesis } from '../hooks/useThesis';
import { thesisSearchSchema } from './-search';

// The thesis editor (frontend spec §1.1). `?history=1` addresses the
// version-history sheet, so the system back gesture closes the sheet
// instead of leaving the screen.
export const Route = createFileRoute('/company/$id/thesis')({
  validateSearch: thesisSearchSchema,
  component: ThesisRoute
});

function ThesisRoute(): ReactElement | null {
  const { id } = Route.useParams();
  const { history } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const company = useCompany(id);
  const thesis = useThesis(id);

  // First render only, while the live queries attach (frontend spec §3).
  if (company === undefined || thesis === undefined) return null;
  if (company === null) {
    return (
      <Placeholder title="No company at this address" note="It may have been removed.">
        <Link className={placeholderStyles.link} to="/">
          Back to the library
        </Link>
      </Placeholder>
    );
  }

  // Keyed by company so a navigation between companies resets the draft.
  return (
    <ThesisScreen
      key={company.id}
      company={company}
      thesis={thesis}
      historyOpen={history === 1}
      onHistoryOpen={() => void navigate({ search: { history: 1 } })}
      onHistoryClose={() => void navigate({ search: {}, replace: true })}
    />
  );
}
