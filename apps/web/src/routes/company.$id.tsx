import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { CompanyRail } from '../components/CompanyRail';
import * as railStyles from '../components/companyRail.css';
import { useCompany } from '../hooks/useCompany';

// The company layout (frontend spec §1.2 amendment): every company screen
// renders in the frame that carries the desktop section rail. Below the
// desktop breakpoint the frame is display: contents, so the stack keeps
// rendering exactly as before.
export const Route = createFileRoute('/company/$id')({
  component: CompanyLayout
});

function CompanyLayout(): ReactElement {
  const { id } = Route.useParams();
  const company = useCompany(id);

  return (
    <div className={railStyles.frame}>
      <CompanyRail companyId={id} companyName={company?.name} />
      <div>
        <Outlet />
      </div>
    </div>
  );
}
