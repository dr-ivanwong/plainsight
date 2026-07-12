import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';

import { okPoints } from '../../components/Sparkline';
import type { CompanyRecord } from '../../db';
import { useMetrics } from '../../hooks/useMetrics';
import { useRedFlags } from '../../hooks/useRedFlags';
import { AddCompanySheet } from './AddCompanySheet';
import { CompanyRow } from './CompanyRow';
import * as styles from './library.css';
import { LibraryEmpty } from './LibraryEmpty';

/**
 * One row's live depth: the report feeds the ROE microsparkline and the
 * red-flag count (active flags only, so a dismissal quietens the library dot
 * exactly as it quietens the dashboard). Hooks per row are fine at a personal
 * library's scale; the engine recomputes only when the store changes.
 */
function LibraryRow({ company }: { company: CompanyRecord }): ReactElement {
  const metrics = useMetrics(company.id);
  const report = metrics === null || metrics === undefined ? undefined : metrics.report;
  const flags = useRedFlags(company.id, report);
  return (
    <CompanyRow
      company={company}
      flagsCount={flags?.active.length}
      roeSpark={report === undefined ? undefined : okPoints(report.metrics.roe, report.fyLabels)}
    />
  );
}

/**
 * The library screen (frontend spec §3): the calm home. One row per company,
 * most recently updated first; the filter field stays invisible until the
 * library outgrows a screenful (progressive disclosure). Compare joins the
 * toolbar in its own phase.
 */
export function Library({
  companies,
  addOpen,
  onAddOpen,
  onAddClose,
  onSample,
  showSampleBanner = false,
  onSampleBannerDismiss
}: {
  companies: CompanyRecord[];
  addOpen: boolean;
  onAddOpen: () => void;
  onAddClose: () => void;
  onSample?: () => void;
  showSampleBanner?: boolean;
  onSampleBannerDismiss?: () => void;
}): ReactElement {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const visible =
    query === ''
      ? companies
      : companies.filter(
          (company) =>
            company.name.toLowerCase().includes(query) ||
            (company.ticker?.toLowerCase().includes(query) ?? false)
        );

  return (
    <>
      <header className={styles.toolbar}>
        <h1 className={styles.title}>Library</h1>
        <div className={styles.toolbarActions}>
          <Link to="/settings" className={styles.toolbarLink}>
            Settings
          </Link>
          {companies.length === 0 ? null : (
            <button type="button" className={styles.addButton} onClick={onAddOpen}>
              + Add
            </button>
          )}
        </div>
      </header>

      {companies.length === 0 ? (
        <LibraryEmpty onAdd={onAddOpen} onSample={onSample} />
      ) : (
        <>
          {showSampleBanner ? (
            <p className={styles.sampleBanner}>
              <span>
                Sample data loaded. Remove it anytime in{' '}
                <Link to="/settings/data" className={styles.sampleBannerLink}>
                  Data &amp; storage
                </Link>
                .
              </span>
              <button
                type="button"
                className={styles.sampleBannerDismiss}
                aria-label="Dismiss the sample note"
                onClick={onSampleBannerDismiss}
              >
                ✕
              </button>
            </p>
          ) : null}
          {companies.length > 12 ? (
            <input
              className={styles.filter}
              type="search"
              aria-label="Filter companies"
              placeholder="Filter by name or ticker"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          ) : null}
          {visible.length === 0 ? (
            <p className={styles.noMatches}>No companies match.</p>
          ) : (
            <ul className={styles.rows}>
              {visible.map((company) => (
                <LibraryRow key={company.id} company={company} />
              ))}
            </ul>
          )}
        </>
      )}

      <AddCompanySheet open={addOpen} onClose={onAddClose} />
    </>
  );
}
