import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';

import type { CompanyRecord } from '../../db';
import { AddCompanySheet } from './AddCompanySheet';
import { CompanyRow } from './CompanyRow';
import * as styles from './library.css';
import { LibraryEmpty } from './LibraryEmpty';

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
  onAddClose
}: {
  companies: CompanyRecord[];
  addOpen: boolean;
  onAddOpen: () => void;
  onAddClose: () => void;
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
        <LibraryEmpty onAdd={onAddOpen} />
      ) : (
        <>
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
                <CompanyRow key={company.id} company={company} />
              ))}
            </ul>
          )}
        </>
      )}

      <AddCompanySheet open={addOpen} onClose={onAddClose} />
    </>
  );
}
