import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type ReactElement } from 'react';

import { SheetShell } from '../../components/SheetShell';
import {
  applyImport,
  buildExport,
  db,
  dryRunCounts,
  parseExportFile,
  removeSampleData,
  setMeta,
  wipeEverything,
  type DryRunCounts,
  type ExportFile
} from '../../db';
import { useCompanies } from '../../hooks/useCompanies';
import { useStorageStatus } from '../../hooks/useStorageStatus';
import * as buttons from '../../styles/buttons.css';
import * as styles from './dataScreen.css';

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(size: number): string {
  if (size < 1000) return `${Math.round(size)} B`;
  let value = size;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${UNITS[unit]}`;
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const localToday = (): string => {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Hands a text file to the browser; quietly a no-op where object URLs do not exist (tests). */
function downloadText(text: string, filename: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ImportState =
  | { kind: 'ready'; file: ExportFile; counts: DryRunCounts }
  | { kind: 'error'; message: string };

const IMPORT_ERRORS = {
  'not-plainsight': 'That file is not a Plainsight export.',
  'newer-version': 'This export comes from a newer Plainsight. Update the app first.',
  'invalid-records':
    'The file is a Plainsight export, but some records did not pass validation, so nothing was imported.'
} as const;

/**
 * Data & storage (frontend spec §3): export with the allowlist, import
 * through the dry-run sheet, persistence and quota, one-tap sample removal,
 * the quarantined records with their raw payloads, and the wipe that makes
 * you type the app's name.
 */
export function DataScreen(): ReactElement {
  const navigate = useNavigate();
  const companies = useCompanies();
  const { status, requestPersist } = useStorageStatus();
  const lastExportRow = useLiveQuery(() => db.meta.get('lastExportAt'), []);
  const quarantineRows = useLiveQuery(() => db.quarantine.toArray(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [wipeText, setWipeText] = useState('');

  const lastExport =
    typeof lastExportRow?.value === 'string' ? lastExportRow.value.slice(0, 10) : null;
  const sampleCount = (companies ?? []).filter((company) => company.sample).length;

  async function handleExport(): Promise<void> {
    try {
      const file = await buildExport(db, __APP_VERSION__);
      downloadText(JSON.stringify(file, null, 2), `plainsight-export-${localToday()}.json`);
      await setMeta(db, 'lastExportAt', new Date().toISOString());
      setExportNote(null);
    } catch {
      setExportNote('Could not build the export.');
    }
  }

  async function handleFileChosen(chosen: File | undefined): Promise<void> {
    if (chosen === undefined) return;
    const parsed = parseExportFile(await chosen.text());
    if (!parsed.ok) {
      setImportState({ kind: 'error', message: IMPORT_ERRORS[parsed.reason] });
      return;
    }
    setImportState({ kind: 'ready', file: parsed.file, counts: dryRunCounts(parsed.file) });
  }

  async function handleImport(mode: 'merge' | 'replace'): Promise<void> {
    if (importState?.kind !== 'ready') return;
    await applyImport(db, importState.file, mode);
    closeImport();
  }

  function closeImport(): void {
    setImportState(null);
    if (fileInputRef.current !== null) fileInputRef.current.value = '';
  }

  async function handleWipe(): Promise<void> {
    await wipeEverything(db);
    await navigate({ to: '/', search: {}, replace: true });
  }

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/settings" className={styles.back}>
          ‹ Settings
        </Link>
        <h1 className={styles.title}>Data &amp; storage</h1>
        <span />
      </header>

      <section className={styles.group} aria-label="Export">
        <h2 className={styles.groupTitle}>Export</h2>
        <p className={styles.note}>
          {lastExport === null ? 'Never exported from this device.' : `Last export ${lastExport}.`}
        </p>
        <div className={styles.actions}>
          <button type="button" className={buttons.secondaryAction} onClick={() => void handleExport()}>
            Export the library
          </button>
        </div>
        {exportNote === null ? null : (
          <p role="alert" className={styles.error}>
            {exportNote}
          </p>
        )}
      </section>

      <section className={styles.group} aria-label="Import">
        <h2 className={styles.groupTitle}>Import</h2>
        <p className={styles.note}>A Plainsight export file; nothing is written before the summary.</p>
        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept="application/json,.json"
            aria-label="Choose an export file"
            onChange={(event) => void handleFileChosen(event.target.files?.[0])}
          />
        </div>
      </section>

      <section className={styles.group} aria-label="Storage">
        <h2 className={styles.groupTitle}>Storage</h2>
        {status === undefined ? null : !status.supported ? (
          <p className={styles.note}>This browser does not report storage.</p>
        ) : (
          <>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                {status.persisted
                  ? 'Persisted: this browser has promised to keep the data.'
                  : 'Not yet persisted; the browser may evict this data under pressure.'}
              </span>
              {status.persisted ? null : (
                <button
                  type="button"
                  className={styles.quietAction}
                  onClick={() => void requestPersist()}
                >
                  Ask to persist
                </button>
              )}
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                {formatBytes(status.usage)} used of {formatBytes(status.quota)}
              </span>
            </div>
            {status.quota > 0 ? (
              <div
                className={styles.meter}
                role="meter"
                aria-label="Storage used"
                aria-valuemin={0}
                aria-valuemax={status.quota}
                aria-valuenow={status.usage}
              >
                <div
                  className={styles.meterFill}
                  style={{ width: `${Math.min(100, (status.usage / status.quota) * 100)}%` }}
                />
              </div>
            ) : null}
          </>
        )}
      </section>

      {sampleCount === 0 ? null : (
        <section className={styles.group} aria-label="Sample data">
          <h2 className={styles.groupTitle}>Sample data</h2>
          <p className={styles.note}>
            {sampleCount} sample {sampleCount === 1 ? 'company' : 'companies'} loaded.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={buttons.secondaryAction}
              onClick={() => void removeSampleData(db)}
            >
              Remove sample data
            </button>
          </div>
        </section>
      )}

      {quarantineRows === undefined || quarantineRows.length === 0 ? null : (
        <section className={styles.group} aria-label="Quarantined records">
          <h2 className={styles.groupTitle}>Quarantined records</h2>
          <p className={styles.note}>
            Records that failed validation on read; export the raw payload or discard them.
          </p>
          <ul className={styles.quarantineList}>
            {quarantineRows.map((row) => (
              <li key={row.id} className={styles.quarantineRow}>
                <span className={styles.quarantineText}>
                  <span className={styles.rowLabel}>{String(row.table)}</span>
                  <span className={styles.note}>{String(row.reason)}</span>
                </span>
                <span className={styles.quarantineActions}>
                  <button
                    type="button"
                    className={styles.quietAction}
                    onClick={() =>
                      downloadText(
                        JSON.stringify(row.raw, null, 2),
                        `plainsight-quarantine-${row.id}.json`
                      )
                    }
                  >
                    Export raw
                  </button>
                  <button
                    type="button"
                    className={styles.quietAction}
                    onClick={() => void db.quarantine.delete(row.id)}
                  >
                    Discard
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.dangerGroup} aria-label="Danger zone">
        <h2 className={styles.groupTitle}>Danger zone</h2>
        <p className={styles.note}>
          Wipe everything on this device: every company, statement, thesis and setting. There is
          no undo; export first.
        </p>
        <div className={styles.actions}>
          <input
            className={styles.confirmInput}
            aria-label="Type Plainsight to confirm"
            placeholder="Type Plainsight to confirm"
            autoComplete="off"
            value={wipeText}
            onChange={(event) => setWipeText(event.target.value)}
          />
          <button
            type="button"
            className={styles.dangerAction}
            disabled={wipeText !== 'Plainsight'}
            onClick={() => void handleWipe()}
          >
            Wipe everything
          </button>
        </div>
      </section>

      {importState === null ? null : (
        <SheetShell open onClose={closeImport} label="Import">
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>Import</h2>
            {importState.kind === 'error' ? (
              <>
                <p className={styles.note}>{importState.message}</p>
                <div className={styles.sheetActions}>
                  <button type="button" className={buttons.secondaryAction} onClick={closeImport}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.note}>This file holds:</p>
                <ul className={styles.countList}>
                  <li>{plural(importState.counts.companies, 'company', 'companies')}</li>
                  <li>{plural(importState.counts.fiscalYears, 'fiscal year', 'fiscal years')}</li>
                  <li>{plural(importState.counts.prices, 'price', 'prices')}</li>
                  <li>{plural(importState.counts.theses, 'thesis', 'theses')}</li>
                  <li>{plural(importState.counts.thesisVersions, 'thesis version', 'thesis versions')}</li>
                  <li>{plural(importState.counts.flagDismissals, 'dismissal', 'dismissals')}</li>
                </ul>
                <p className={styles.note}>
                  Merge keeps the newer of any record held on both sides. Replace wipes this
                  device&apos;s library first.
                </p>
                <div className={styles.sheetActions}>
                  <button
                    type="button"
                    className={buttons.primaryAction}
                    onClick={() => void handleImport('merge')}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    className={buttons.secondaryAction}
                    onClick={() => void handleImport('replace')}
                  >
                    Replace
                  </button>
                  <button type="button" className={styles.quietAction} onClick={closeImport}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </SheetShell>
      )}
    </>
  );
}
