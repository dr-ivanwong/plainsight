import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import { ThesisScreen } from '../features/thesis/ThesisScreen';
import { useCompany } from '../hooks/useCompany';
import { useThesis } from '../hooks/useThesis';

// The thesis editor (frontend spec §1.1). `?history=1` will address the
// version-history sheet when versions arrive with the next slice.
export const Route = createFileRoute('/company/$id/thesis')({
  component: ThesisRoute
});

function ThesisRoute(): ReactElement | null {
  const { id } = Route.useParams();
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
  return <ThesisScreen key={company.id} company={company} thesis={thesis} />;
}
