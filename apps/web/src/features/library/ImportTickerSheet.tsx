import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type ReactElement } from 'react';

import type { SearchResult } from '@plainsight/api-contract';

import { fetchFinancials, searchTickers } from '../../api/client';
import { SheetShell } from '../../components/SheetShell';
import { db } from '../../db';
import { useDebounced } from '../../hooks/useDebounced';
import * as buttons from '../../styles/buttons.css';
import { existingImportTarget, importFinancials } from './importCompany';
import * as styles from './importTicker.css';

/**
 * A cold ticker answers 202 while its filings ingest; the budget is a
 * fresh-request wait of ten seconds or so (main plan §8 exit criterion), and
 * the cap is a minute of patience before the manual path is offered.
 */
const MAX_ATTEMPTS = 12;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class ImportError extends Error {}

async function runImport(
  listing: SearchResult,
  onWaiting: () => void
): Promise<{ companyId: string; alreadyInLibrary: boolean }> {
  const existing = await existingImportTarget(db, listing.ticker);
  if (existing !== null) {
    // Re-importing opens the owner's existing research instead of a twin.
    return { companyId: existing.id, alreadyInLibrary: true };
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await fetchFinancials(listing.ticker);
    if (result.kind === 'ok') {
      if (result.data.statements.length === 0) {
        throw new ImportError(
          'No annual statements came back for this ticker. You can enter the numbers manually.'
        );
      }
      const company = await importFinancials(listing, result.data);
      return { companyId: company.id, alreadyInLibrary: false };
    }
    if (result.kind === 'ingesting') {
      onWaiting();
      await sleep(result.retryAfterSeconds * 1000);
      continue;
    }
    throw new ImportError(result.message);
  }
  throw new ImportError(
    'Still fetching the filings after a minute. Try again shortly, or enter the numbers manually.'
  );
}

/**
 * The ticker-search sheet (frontend spec §3, import pickers): debounced
 * search with exchange badges, then the import itself with an honest waiting
 * state while a first-ever request ingests. Success lands on the company
 * dashboard: ticker to pre-filled ten-year model, reviewed from there
 * exactly as entered data would be (Journey B).
 */
export function ImportTickerSheet({
  open,
  onClose,
  onEnterManually
}: {
  open: boolean;
  onClose: () => void;
  onEnterManually: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [waiting, setWaiting] = useState(false);
  const query = useDebounced(input.trim(), 250);

  const search = useQuery({
    queryKey: ['tickerSearch', query],
    queryFn: ({ signal }) => searchTickers(query, signal),
    enabled: open && query.length > 0,
    staleTime: 60_000
  });

  const importMutation = useMutation({
    mutationFn: (listing: SearchResult) => runImport(listing, () => setWaiting(true)),
    onSuccess: ({ companyId }) =>
      void navigate({ to: '/company/$id', params: { id: companyId }, replace: true })
  });

  // A closed sheet forgets everything: reopening starts a fresh search.
  useEffect(() => {
    if (!open) {
      setInput('');
      setWaiting(false);
      importMutation.reset();
    }
    // The mutation object identity changes per render; reset is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const importing = importMutation.isPending;
  const failure = importMutation.error;
  const pickedTicker = importMutation.variables?.ticker;

  return (
    <SheetShell open={open} onClose={onClose} label="Import from a ticker">
      <div className={styles.panel}>
        <h2 className={styles.heading}>Import from a ticker</h2>

        {importing ? (
          <div className={styles.progress} role="status" aria-live="polite">
            <p className={styles.progressPrimary}>
              Fetching {pickedTicker ?? 'the'} filings from EDGAR…
            </p>
            <p className={styles.progressSecondary}>
              {waiting
                ? 'First request for this ticker: its filings are being ingested. This takes about ten seconds.'
                : 'Ten years of standardised statements, each number linked to its filing.'}
            </p>
          </div>
        ) : (
          <>
            <input
              className={styles.searchInput}
              type="search"
              aria-label="Search by ticker or company name"
              placeholder="Ticker or company name"
              autoComplete="off"
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />

            {failure !== null ? (
              <p className={styles.error} role="alert">
                {failure instanceof ImportError
                  ? failure.message
                  : 'The import did not finish. Try again, or enter the numbers manually.'}
              </p>
            ) : null}

            {query.length === 0 ? (
              <p className={styles.hint}>
                US-listed companies, standardised from their SEC filings. Search by ticker or name.
              </p>
            ) : search.isError ? (
              <p className={styles.hint}>
                Search is unavailable right now. It needs a connection; you can enter the numbers
                manually instead.
              </p>
            ) : search.data === undefined ? (
              <p className={styles.hint}>Searching…</p>
            ) : search.data.results.length === 0 ? (
              <p className={styles.hint}>No matches for “{query}”.</p>
            ) : (
              <ul className={styles.results}>
                {search.data.results.map((result) => (
                  <li key={result.ticker}>
                    <button
                      type="button"
                      className={styles.resultButton}
                      onClick={() => importMutation.mutate(result)}
                    >
                      <span className={styles.resultTicker}>{result.ticker}</span>
                      <span className={styles.resultName}>{result.name}</span>
                      {result.exchange === undefined ? null : (
                        <span className={styles.exchangeBadge}>{result.exchange}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.actions}>
              <button type="button" className={buttons.secondaryAction} onClick={onEnterManually}>
                Enter manually
              </button>
              <button type="button" className={buttons.secondaryAction} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </SheetShell>
  );
}
