import { LINE_ITEMS } from '@plainsight/calc-engine';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Placeholder } from '../components/Placeholder';
import * as placeholderStyles from '../components/placeholder.css';
import { EntryScreen } from '../features/entry/EntryScreen';
import { useCompany } from '../hooks/useCompany';
import { useStatements } from '../hooks/useStatements';
import { entrySearchSchema } from './-search';

// Data entry (frontend spec §3). The search params are the pinned deep-link
// format (data-model spec §10): insufficient-data cards land on the first
// missing item via `?stmt=&fy=&focus=`, and the segmented control itself
// lives in `?stmt=` so the exact view survives bookmarks and relaunch.
export const Route = createFileRoute('/company/$id/entry')({
  validateSearch: entrySearchSchema,
  component: EntryRoute
});

function EntryRoute(): ReactElement | null {
  const { id } = Route.useParams();
  const { stmt, fy, focus, job, upload } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const company = useCompany(id);
  const statements = useStatements(id);

  if (company === undefined || statements === undefined) return null;
  if (company === null) {
    return (
      <Placeholder title="No company at this address" note="It may have been removed.">
        <Link className={placeholderStyles.link} to="/">
          Back to the library
        </Link>
      </Placeholder>
    );
  }

  // A deep link names its item; the item names its statement when `stmt` is absent.
  const statement = stmt ?? (focus === undefined ? 'income' : LINE_ITEMS[focus].statement);
  const focusTarget = focus !== undefined && fy !== undefined ? { id: focus, fy } : undefined;

  return (
    <EntryScreen
      company={company}
      statements={statements}
      statement={statement}
      focusTarget={focusTarget}
      onStatementChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, stmt: next }), replace: true })
      }
      jobId={job}
      onJobOpen={(jobId) =>
        void navigate({
          // The job takes the upload sheet's place in the address.
          search: ({ upload: _chosen, ...rest }) => ({ ...rest, job: jobId })
        })
      }
      onJobDismiss={() =>
        void navigate({
          search: ({ job: _finished, ...rest }) => rest,
          replace: true
        })
      }
      uploadOpen={upload === 1}
      onUploadOpen={() =>
        void navigate({ search: (previous) => ({ ...previous, upload: 1 }) })
      }
      onUploadClose={() =>
        void navigate({
          search: ({ upload: _closed, ...rest }) => rest,
          replace: true
        })
      }
    />
  );
}
