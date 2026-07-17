import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComparisonTable } from '../../components/ComparisonTable';
import type { CompanyRecord } from '../../db';
import { MAX_COMPARE, type Comparison } from '../../hooks/useComparison';
import * as buttons from '../../styles/buttons.css';
import * as styles from './compare.css';

/**
 * The compare screen (frontend spec §3): picker state first, chips to pick
 * 2 to 4 companies, then the metric-by-company grid. The selection lives in
 * `?ids=`, so a comparison is bookmarkable and the back gesture leaves the
 * screen rather than unpicking chips one by one.
 */
export function CompareScreen({
  companies,
  selectedIds,
  comparison,
  onToggle
}: {
  companies: readonly CompanyRecord[];
  selectedIds: readonly string[];
  comparison: Comparison | undefined;
  onToggle: (id: string) => void;
}): ReactElement {
  const atCap = selectedIds.length >= MAX_COMPARE;
  const columns =
    comparison === undefined
      ? []
      : comparison.columns.map(({ company, report }) => ({
          companyId: company.id,
          name: company.name,
          report
        }));

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/" className={styles.back}>
          ‹ Library
        </Link>
      </header>

      <div className={styles.hero}>
        <h1 className={styles.title}>Compare</h1>
        {companies.length < 2 ? null : (
          <p className={styles.hint}>Pick 2 to 4 companies to set side by side.</p>
        )}
      </div>

      {companies.length < 2 ? (
        <section className={styles.empty}>
          <p className={styles.emptyNote}>
            Comparison needs at least two companies in the library. Add another and its measures
            line up here, side by side.
          </p>
          <Link to="/" search={{ add: 1 }} className={buttons.primaryAction}>
            Add a company
          </Link>
        </section>
      ) : (
        <>
          <div role="group" aria-label="Companies to compare" className={styles.chips}>
            {companies.map((company) => {
              const selected = selectedIds.includes(company.id);
              return (
                <button
                  key={company.id}
                  type="button"
                  className={selected ? styles.chipSelected : styles.chip}
                  aria-pressed={selected}
                  disabled={!selected && atCap}
                  onClick={() => onToggle(company.id)}
                >
                  {company.name}
                </button>
              );
            })}
          </div>

          {columns.length < 2 ? null : (
            <>
              {comparison?.mixedCurrencies === true ? (
                <p className={styles.currencyNote}>
                  Money rows are hidden: these companies report in different currencies, and the
                  app never converts. Ratios compare freely.
                </p>
              ) : null}
              <ComparisonTable
                columns={columns}
                hideAbsolutes={comparison?.mixedCurrencies === true}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
