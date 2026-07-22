import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useState, type ReactElement } from 'react';

import { InstallExplainer } from '../../components/InstallExplainer';
import { SegmentedControl } from '../../components/SegmentedControl';
import { okPoints } from '../../components/Sparkline';
import {
  db,
  SECTOR_IDS,
  SECTOR_LABELS,
  setMeta,
  type CompanyRecord,
  type SectorId
} from '../../db';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMetrics } from '../../hooks/useMetrics';
import { useRedFlags } from '../../hooks/useRedFlags';
import { AddCompanySheet } from './AddCompanySheet';
import { CompanyRow } from './CompanyRow';
import { ImportTickerSheet } from './ImportTickerSheet';
import * as styles from './library.css';
import { LibraryEmpty } from './LibraryEmpty';
import { LIBRARY_WIDE_MEDIA } from './libraryMedia';

// The screener loads only when the toggle first asks for it: the rows are
// the default at every width, and the shell's initial JS budget never pays
// for a desktop-only view (main plan §5, the bundle gate).
const LibraryTable = lazy(() =>
  import('./LibraryTable').then((module) => ({ default: module.LibraryTable }))
);

const LIBRARY_VIEW_OPTIONS: readonly { value: 'rows' | 'table'; label: string }[] = [
  { value: 'rows', label: 'Rows' },
  { value: 'table', label: 'Table' }
];

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
      roeLatest={report?.metrics.roe.latest}
      roeDelta={report?.metrics.roe.delta}
    />
  );
}

interface LibrarySection {
  key: SectorId | 'unclassified';
  /** Null means no header: the all-unclassified library reads as one flat list. */
  label: string | null;
  companies: CompanyRecord[];
}

/**
 * Rows group under the pinned vocabulary in vocabulary order, unclassified
 * gathering last (frontend spec §3, the sector sections). Empty sections
 * never render, and the Unclassified header renders only when a classified
 * section also renders: until anything is classified, the library reads
 * exactly as it always did. Input order (most recently updated first) stands
 * within each section.
 */
function sectionsOf(companies: readonly CompanyRecord[]): LibrarySection[] {
  const bySector = new Map<SectorId, CompanyRecord[]>();
  const unclassified: CompanyRecord[] = [];
  for (const company of companies) {
    if (company.sector === undefined) {
      unclassified.push(company);
      continue;
    }
    const bucket = bySector.get(company.sector);
    if (bucket === undefined) bySector.set(company.sector, [company]);
    else bucket.push(company);
  }
  const sections: LibrarySection[] = [];
  for (const id of SECTOR_IDS) {
    const rows = bySector.get(id);
    if (rows !== undefined) sections.push({ key: id, label: SECTOR_LABELS[id], companies: rows });
  }
  if (unclassified.length > 0) {
    sections.push({
      key: 'unclassified',
      label: sections.length === 0 ? null : 'Unclassified',
      companies: unclassified
    });
  }
  return sections;
}

/**
 * The library screen (frontend spec §3): the calm home. One row per company,
 * grouped under quiet sector section headers, most recently updated first
 * within a section; the filter field stays invisible until the library
 * outgrows a screenful (progressive disclosure). Compare joins the toolbar
 * the moment two companies exist to set side by side, and not before.
 */
export function Library({
  companies,
  addOpen,
  onAddOpen,
  onAddClose,
  importOpen = false,
  onImportOpen,
  onImportClose,
  onImportToManual,
  online = true,
  onSample,
  showSampleBanner = false,
  onSampleBannerDismiss,
  showInstallExplainer = false,
  onInstallExplainerDismiss
}: {
  companies: CompanyRecord[];
  addOpen: boolean;
  onAddOpen: () => void;
  onAddClose: () => void;
  importOpen?: boolean;
  onImportOpen?: () => void;
  onImportClose?: () => void;
  onImportToManual?: () => void;
  online?: boolean;
  onSample?: () => void;
  showSampleBanner?: boolean;
  onSampleBannerDismiss?: () => void;
  showInstallExplainer?: boolean;
  onInstallExplainerDismiss?: () => void;
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

  // The screener (finance-look gap plan §5): a desktop-width reading of the
  // same library. The choice persists beside the dashboard's, but narrow
  // screens keep the rows whatever it says: a seven-column table has no
  // honest phone rendering.
  const wide = useMediaQuery(LIBRARY_WIDE_MEDIA);
  const tableViewRow = useLiveQuery(() => db.meta.get('libraryTableView'), []);
  const tableMode = wide && tableViewRow?.value === true;

  return (
    <>
      {showInstallExplainer && onInstallExplainerDismiss !== undefined ? (
        <InstallExplainer onDismiss={onInstallExplainerDismiss} />
      ) : null}
      <header className={styles.toolbar}>
        <h1 className={styles.title}>Library</h1>
        <div className={styles.toolbarActions}>
          {companies.length < 2 ? null : (
            <Link to="/compare" className={styles.toolbarLink}>
              Compare
            </Link>
          )}
          <Link to="/settings" className={styles.toolbarLink}>
            Settings
          </Link>
          {/* Online-only affordance (degradation matrix, main plan §5): hidden
              offline, with the quiet pill marking the absence (frontend §2). */}
          {onImportOpen === undefined ? null : online ? (
            <button type="button" className={styles.addButton} onClick={onImportOpen}>
              Import
            </button>
          ) : (
            <span className={styles.offlinePill} title="Ticker import is available when online, or enter manually.">
              Offline
            </span>
          )}
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
          {wide ? (
            <div className={styles.viewRow}>
              <SegmentedControl
                label="Library view"
                options={LIBRARY_VIEW_OPTIONS}
                value={tableMode ? 'table' : 'rows'}
                onChange={(next) => void setMeta(db, 'libraryTableView', next === 'table')}
              />
            </div>
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
          ) : tableMode ? (
            // The screener: flat and sortable, so the sector bands step aside.
            <Suspense fallback={null}>
              <LibraryTable companies={visible} />
            </Suspense>
          ) : (
            // The filter matches rows wherever they sit; a section left with
            // no matches drops out entirely (frontend spec §3).
            sectionsOf(visible).map((section) =>
              section.label === null ? (
                <ul key={section.key} className={styles.rows}>
                  {section.companies.map((company) => (
                    <LibraryRow key={company.id} company={company} />
                  ))}
                </ul>
              ) : (
                <section key={section.key} className={styles.sectionGroup}>
                  {/* A group heading announced before its rows (frontend spec §8). */}
                  <h2 id={`library-section-${section.key}`} className={styles.sectionHeader}>
                    {section.label}
                  </h2>
                  <ul
                    className={styles.rows}
                    aria-labelledby={`library-section-${section.key}`}
                  >
                    {section.companies.map((company) => (
                      <LibraryRow key={company.id} company={company} />
                    ))}
                  </ul>
                </section>
              )
            )
          )}
        </>
      )}

      <AddCompanySheet open={addOpen} onClose={onAddClose} />
      {onImportClose === undefined || onImportToManual === undefined ? null : (
        <ImportTickerSheet
          open={importOpen}
          onClose={onImportClose}
          onEnterManually={onImportToManual}
        />
      )}
    </>
  );
}
