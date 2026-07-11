import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import type { CompanyRecord } from '../../db';
import * as styles from './companyRow.css';
import { relativeUpdated } from './relativeUpdated';

/**
 * One library row (frontend spec §3): a single link with a composite label so
 * the row is one focus stop (frontend spec §8). The red-flag count and the
 * ten-year ROE microsparkline join the row when the metrics binding lands.
 */
export function CompanyRow({ company }: { company: CompanyRecord }): ReactElement {
  const updated = relativeUpdated(company.updatedAt);
  const badge = [company.ticker, company.exchange].filter(Boolean).join(' · ');
  const label = [company.name, company.sample ? 'sample data' : '', updated]
    .filter(Boolean)
    .join(', ');

  return (
    <li>
      <Link to="/company/$id" params={{ id: company.id }} className={styles.row} aria-label={label}>
        <span className={styles.identity}>
          <span className={styles.name}>{company.name}</span>
          {company.sample ? <span className={styles.sampleChip}>Sample</span> : null}
          {badge === '' ? null : <span className={styles.badge}>{badge}</span>}
        </span>
        <span className={styles.updated}>{updated}</span>
      </Link>
    </li>
  );
}
