import {
  formatMetricValue,
  METRICS,
  type MetricDelta,
  type MetricValue
} from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { DeltaChip } from '../../components/DeltaChip';
import { Sparkline, type SparkPoint } from '../../components/Sparkline';
import type { CompanyRecord } from '../../db';
import * as styles from './companyRow.css';
import { relativeUpdated } from './relativeUpdated';

/**
 * One library row (frontend spec §3): name, ticker and exchange badge, the
 * red-flag dot count, and on the trailing edge the watchlist figure block
 * (finance-look gap plan §5: latest ROE with its coloured delta, one number,
 * not a data dump), the ten-year ROE microsparkline, and last-updated, all
 * behind a single link with a composite label so the row is one focus stop
 * (frontend spec §8). The figure renders only when ROE computed: a
 * degenerate figure on the home list would be noise, not signal.
 */
export function CompanyRow({
  company,
  flagsCount,
  roeSpark,
  roeLatest,
  roeDelta
}: {
  company: CompanyRecord;
  flagsCount?: number;
  roeSpark?: readonly SparkPoint[];
  roeLatest?: MetricValue | null;
  roeDelta?: MetricDelta | null;
}): ReactElement {
  const updated = relativeUpdated(company.updatedAt);
  const badge = [company.ticker, company.exchange].filter(Boolean).join(' · ');
  const flags =
    flagsCount !== undefined && flagsCount > 0
      ? `${flagsCount} ${flagsCount === 1 ? 'flag' : 'flags'}`
      : '';
  const roeText =
    roeLatest !== undefined && roeLatest !== null && roeLatest.status === 'ok'
      ? formatMetricValue(roeLatest, METRICS.roe.format, company.currency)
      : null;
  const label = [
    company.name,
    company.sample ? 'sample data' : '',
    flags,
    roeText === null ? '' : `ROE ${roeText}`,
    updated
  ]
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
          {roeText === null ? null : (
            <span className={styles.roeBlock}>
              <span className={styles.roeLabel}>ROE</span>
              <span className={styles.roeValue}>{roeText}</span>
              {roeDelta === undefined || roeDelta === null ? null : (
                <DeltaChip
                  delta={roeDelta}
                  kind={METRICS.roe.format}
                  currency={company.currency}
                  healthDirection={METRICS.roe.healthDirection}
                />
              )}
            </span>
          )}
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
