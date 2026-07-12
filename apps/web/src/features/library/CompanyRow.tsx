import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Sparkline, type SparkPoint } from '../../components/Sparkline';
import type { CompanyRecord } from '../../db';
import * as styles from './companyRow.css';
import { relativeUpdated } from './relativeUpdated';

/**
 * One library row (frontend spec §3): name, ticker and exchange badge, the
 * red-flag dot count, the ten-year ROE microsparkline, and last-updated, all
 * behind a single link with a composite label so the row is one focus stop
 * (frontend spec §8).
 */
export function CompanyRow({
  company,
  flagsCount,
  roeSpark
}: {
  company: CompanyRecord;
  flagsCount?: number;
  roeSpark?: readonly SparkPoint[];
}): ReactElement {
  const updated = relativeUpdated(company.updatedAt);
  const badge = [company.ticker, company.exchange].filter(Boolean).join(' · ');
  const flags =
    flagsCount !== undefined && flagsCount > 0
      ? `${flagsCount} ${flagsCount === 1 ? 'flag' : 'flags'}`
      : '';
  const label = [company.name, company.sample ? 'sample data' : '', flags, updated]
    .filter(Boolean)
    .join(', ');

  return (
    <li>
      <Link to="/company/$id" params={{ id: company.id }} className={styles.row} aria-label={label}>
        <span className={styles.identity}>
          <span className={styles.name}>{company.name}</span>
          {company.sample ? <span className={styles.sampleChip}>Sample</span> : null}
          {badge === '' ? null : <span className={styles.badge}>{badge}</span>}
          {flags === '' ? null : (
            <span className={styles.flagCount} aria-hidden="true">
              ● {flagsCount}
            </span>
          )}
        </span>
        <span className={styles.trailing}>
          {roeSpark === undefined || roeSpark.length < 2 ? null : (
            <span className={styles.spark}>
              <Sparkline points={roeSpark} />
            </span>
          )}
          <span className={styles.updated}>{updated}</span>
        </span>
      </Link>
    </li>
  );
}
