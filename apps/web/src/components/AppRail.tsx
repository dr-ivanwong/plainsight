import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import * as styles from './appRail.css';

const COMPANY_SECTIONS = [
  { label: 'Dashboard', to: '/company/$id', exact: true },
  { label: 'Data entry', to: '/company/$id/entry', exact: false },
  { label: 'Thesis', to: '/company/$id/thesis', exact: false }
] as const;

/**
 * The desktop navigation rail (frontend spec §1.2 amendment, main plan
 * §12.11): persistent at ≥1200px on every screen except the welcome flow.
 * Top-level destinations first, with Compare joining once two companies
 * exist (the library's progressive rule, frontend spec §3), then the open
 * company's sections beneath its name. The router owns activeness through
 * Link (class and aria-current), with exact matching where a destination
 * would otherwise light for its children's routes. Below the breakpoint the
 * rail contributes nothing and the stack stands untouched.
 */
export function AppRail({
  showCompare,
  showPairs,
  companyId,
  companyName
}: {
  showCompare: boolean;
  /** The sleeve's progressive rule (integration plan §4): Pairs joins once this device has seen artefacts on the API. */
  showPairs: boolean;
  companyId?: string;
  companyName?: string;
}): ReactElement {
  return (
    <nav className={styles.rail} aria-label="Main">
      <ul className={styles.sections}>
        <li>
          <Link
            to="/"
            className={styles.section}
            activeProps={{ className: styles.sectionActive }}
            activeOptions={{ exact: true }}
          >
            Library
          </Link>
        </li>
        {showCompare ? (
          <li>
            <Link
              to="/compare"
              className={styles.section}
              activeProps={{ className: styles.sectionActive }}
            >
              Compare
            </Link>
          </li>
        ) : null}
        {showPairs ? (
          <li>
            <Link
              to="/pairs"
              className={styles.section}
              activeProps={{ className: styles.sectionActive }}
            >
              Pairs
            </Link>
          </li>
        ) : null}
        <li>
          <Link
            to="/settings"
            className={styles.section}
            activeProps={{ className: styles.sectionActive }}
          >
            Settings
          </Link>
        </li>
      </ul>
      {companyId === undefined ? null : (
        <div className={styles.companyGroup}>
          {companyName === undefined ? null : <span className={styles.name}>{companyName}</span>}
          <ul className={styles.sections}>
            {COMPANY_SECTIONS.map((section) => (
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
        </div>
      )}
    </nav>
  );
}
