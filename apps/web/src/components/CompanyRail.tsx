import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import * as styles from './companyRail.css';

const SECTIONS = [
  { label: 'Dashboard', to: '/company/$id', exact: true },
  { label: 'Data entry', to: '/company/$id/entry', exact: false },
  { label: 'Thesis', to: '/company/$id/thesis', exact: false }
] as const;

/**
 * The desktop section rail (frontend spec §1.2 amendment, main plan §12.10):
 * inside a company at ≥1200px, the three sections sit one click apart beside
 * the content column. Per-company chrome only; below the breakpoint the rail
 * contributes nothing and the stack navigation stands untouched. The router
 * owns activeness: Link marks the current section (class and aria-current),
 * with exact matching on the index so a section never lights its parent.
 */
export function CompanyRail({
  companyId,
  companyName
}: {
  companyId: string;
  companyName?: string;
}): ReactElement {
  return (
    <nav className={styles.rail} aria-label="Company sections">
      <Link to="/" className={styles.libraryLink} activeOptions={{ exact: true }}>
        ‹ Library
      </Link>
      {companyName === undefined ? null : <span className={styles.name}>{companyName}</span>}
      <ul className={styles.sections}>
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              params={{ id: companyId }}
              className={styles.section}
              activeProps={{ className: styles.sectionActive }}
              activeOptions={{ exact: section.exact }}
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
