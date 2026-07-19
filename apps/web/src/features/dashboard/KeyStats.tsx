import { METRICS, type MetricId } from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { StatusValue } from '../../components/StatusValue';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import * as styles from './keyStats.css';

/**
 * The four headline figures an analyst reads first (dashboard design plan
 * §5.3): one from each of the first four metric groups; valuation is
 * deliberately excluded, being priced and situational. Each stat opens its
 * metric's detail sheet through the same search param as its card.
 */
const KEY_STATS: readonly MetricId[] = ['roe', 'netMargin', 'debtToEquity', 'fcf'];

export function KeyStats({ metrics }: { metrics: CompanyMetrics }): ReactElement | null {
  const { company, report } = metrics;
  if (report.latestFy === null) return null;

  return (
    <section className={styles.row} aria-label="Key stats">
      {KEY_STATS.map((id) => {
        const def = METRICS[id];
        const latest = report.metrics[id].latest;
        if (latest === null) return null;
        return (
          <Link
            key={id}
            to="/company/$id"
            params={{ id: company.id }}
            search={{ metric: id }}
            className={styles.stat}
          >
            <span className={styles.statLabel}>{def.label}</span>
            <StatusValue
              value={latest}
              kind={def.format}
              currency={company.currency}
              scale="stat"
            />
          </Link>
        );
      })}
    </section>
  );
}
