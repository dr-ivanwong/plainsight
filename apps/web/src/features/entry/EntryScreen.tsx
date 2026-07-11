import {
  compareFyLabels,
  coreItemsFor,
  fyLabelFromEndDate,
  LINE_ITEMS,
  LINE_ITEM_IDS,
  type FyLabel,
  type LineItemId,
  type Provenance,
  type Scale,
  type StatementKind
} from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';

import type { FieldValue } from '../../components/MoneyField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SCALE_WORD, StatementGrid, type GridYear } from '../../components/StatementGrid';
import {
  db,
  upsertStatement,
  type CompanyRecord,
  type StatementRecord,
  type StatementWrite
} from '../../db';
import * as buttons from '../../styles/buttons.css';
import * as styles from './entryScreen.css';

const STATEMENT_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'balance', label: 'Balance' },
  { value: 'cashflow', label: 'Cash flow' }
] as const;

const SCALES: readonly Scale[] = ['ones', 'thousands', 'millions', 'billions'];

const SOURCE_WORD: Readonly<Record<Provenance['source'], string>> = {
  manual: 'entered by hand',
  sample: 'sample data',
  edgar: 'EDGAR filing',
  asx_map: 'ASX filing',
  user_upload: 'uploaded document'
};

/** One fiscal-year column: stored rows by statement, or a not-yet-committed draft. */
interface YearColumn {
  fy: FyLabel;
  endDate: string;
  entryScale: Scale;
  byKind: Partial<Record<StatementKind, StatementRecord>>;
}

interface DraftYear {
  fy: FyLabel;
  endDate: string;
  entryScale: Scale;
}

const KIND_ORDER: readonly StatementKind[] = ['income', 'balance', 'cashflow'];

function buildColumns(statements: readonly StatementRecord[], draft: DraftYear | null): YearColumn[] {
  const byFy = new Map<FyLabel, YearColumn>();
  for (const row of statements) {
    const column = byFy.get(row.fy) ?? {
      fy: row.fy,
      endDate: row.endDate,
      entryScale: row.entryScale,
      byKind: {}
    };
    column.byKind[row.statement] = row;
    byFy.set(row.fy, column);
  }
  // Year-level fields follow the same precedence as the financials assembler:
  // income wins, then balance, then cashflow.
  for (const column of byFy.values()) {
    const head = KIND_ORDER.map((kind) => column.byKind[kind]).find((row) => row !== undefined);
    if (head !== undefined) {
      column.endDate = head.endDate;
      column.entryScale = head.entryScale;
    }
  }
  const columns = [...byFy.values()].sort((a, b) => compareFyLabels(b.fy, a.fy));
  if (draft !== null && !byFy.has(draft.fy)) {
    columns.unshift({ ...draft, byKind: {} });
  }
  return columns;
}

function bumpYear(endDate: string): string {
  const year = Number(endDate.slice(0, 4)) + 1;
  const rest = endDate.slice(4);
  return rest === '-02-29' ? `${year}-02-28` : `${year}${rest}`;
}

const toEntry = (value: number | 'zero') =>
  value === 'zero' ? ({ kind: 'not_reported_zero' } as const) : ({ kind: 'entered', amountMinor: value } as const);

/**
 * The data entry screen (frontend spec §3): statements as segments, fiscal
 * years as columns newest first, autosave on every commit with a quiet status
 * ticker, and a draft year that exists only locally until its first figure is
 * committed, so storage never holds an empty shell it did not need.
 */
export function EntryScreen({
  company,
  statements,
  statement,
  focusTarget,
  onStatementChange
}: {
  company: CompanyRecord;
  statements: readonly StatementRecord[];
  statement: StatementKind;
  focusTarget?: { id: LineItemId; fy: FyLabel };
  onStatementChange: (next: StatementKind) => void;
}): ReactElement {
  const [draft, setDraft] = useState<DraftYear | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [localFocus, setLocalFocus] = useState<{ id: LineItemId; fy: FyLabel } | undefined>();
  const [status, setStatus] = useState<{ ok: boolean } | null>(null);

  // The draft column retires the moment its first committed row arrives live.
  useEffect(() => {
    if (draft !== null && statements.some((row) => row.fy === draft.fy)) setDraft(null);
  }, [statements, draft]);

  const columns = useMemo(() => buildColumns(statements, draft), [statements, draft]);

  const rows = useMemo(
    () => LINE_ITEM_IDS.map((id) => LINE_ITEMS[id]).filter((item) => item.statement === statement),
    [statement]
  );

  const core = coreItemsFor(statement);
  const gridYears: GridYear[] = columns.map((column) => {
    const row = column.byKind[statement];
    const values = row?.values ?? {};
    const have = core.filter((id) => values[id] !== undefined).length;
    const headerNotes = [`${have} of ${core.length} core items`];
    if (row !== undefined) headerNotes.push(SOURCE_WORD[row.provenance.source]);
    return {
      fy: column.fy,
      entryScale: column.entryScale,
      currency: company.currency,
      values,
      headerNotes
    };
  });

  async function handleCommit(fy: FyLabel, id: LineItemId, value: FieldValue): Promise<void> {
    const column = columns.find((entry) => entry.fy === fy);
    if (column === undefined) return;
    const existing = column.byKind[statement];
    if (existing === undefined && value === null) return;

    const values = { ...(existing?.values ?? {}) };
    if (value === null) {
      delete values[id];
    } else {
      values[id] = toEntry(value);
    }
    const write: StatementWrite = {
      companyId: company.id,
      fy,
      statement,
      endDate: existing?.endDate ?? column.endDate,
      entryScale: existing?.entryScale ?? column.entryScale,
      values,
      provenance: existing?.provenance ?? { source: 'manual', recordedAt: new Date().toISOString() }
    };
    try {
      await upsertStatement(db, write);
      setStatus({ ok: true });
    } catch {
      setStatus({ ok: false });
    }
  }

  async function handleScaleChange(fy: FyLabel, entryScale: Scale): Promise<void> {
    if (draft !== null && draft.fy === fy) {
      setDraft({ ...draft, entryScale });
      return;
    }
    try {
      for (const row of statements.filter((entry) => entry.fy === fy)) {
        const { updatedAt: _stamp, ...write } = row;
        await upsertStatement(db, { ...write, entryScale });
      }
      setStatus({ ok: true });
    } catch {
      setStatus({ ok: false });
    }
  }

  function handleAddYear(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const endDate = String(form.get('endDate') ?? '');
    const entryScale = String(form.get('entryScale') ?? 'millions') as Scale;
    let fy: FyLabel;
    try {
      fy = fyLabelFromEndDate(endDate);
    } catch {
      setAddError('Enter the date the fiscal year ends.');
      return;
    }
    if (columns.some((column) => column.fy === fy)) {
      setAddError(`${fy} is already here.`);
      return;
    }
    setDraft({ fy, endDate, entryScale });
    setAddOpen(false);
    setAddError(null);
    const first = rows[0];
    if (first !== undefined) setLocalFocus({ id: first.id, fy });
  }

  const hasColumns = columns.length > 0;
  const newest = columns[0];
  const showAddForm = addOpen || !hasColumns;

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/company/$id" params={{ id: company.id }} className={styles.back}>
          ‹ {company.name}
        </Link>
        <h1 className={styles.title}>Data entry</h1>
        <p role="status" className={status !== null && !status.ok ? styles.tickerError : styles.ticker}>
          {status === null ? '' : status.ok ? 'Saved · just now' : 'Could not save. The value was not stored.'}
        </p>
      </header>

      <div className={styles.toolbar}>
        <SegmentedControl
          label="Statement"
          options={STATEMENT_OPTIONS}
          value={statement}
          onChange={onStatementChange}
        />
        {hasColumns ? (
          <button type="button" className={styles.addYearButton} onClick={() => setAddOpen((open) => !open)}>
            Add a year
          </button>
        ) : null}
      </div>

      {hasColumns ? null : (
        <p className={styles.emptyNote}>
          No fiscal years yet. Add the year the statements report, then enter the figures as
          printed.
        </p>
      )}

      {showAddForm ? (
        <form className={styles.addForm} onSubmit={handleAddYear}>
          <label className={styles.addField}>
            <span className={styles.addLabel}>Year-end date</span>
            <input
              className={styles.addInput}
              type="date"
              name="endDate"
              required
              defaultValue={newest === undefined ? '' : bumpYear(newest.endDate)}
            />
          </label>
          <label className={styles.addField}>
            <span className={styles.addLabel}>Figures in</span>
            <select
              className={styles.addInput}
              name="entryScale"
              defaultValue={newest?.entryScale ?? 'millions'}
            >
              {SCALES.map((scale) => (
                <option key={scale} value={scale}>
                  {SCALE_WORD[scale]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttons.primaryAction}>
            Add year
          </button>
          {addError === null ? null : (
            <p role="alert" className={styles.addError}>
              {addError}
            </p>
          )}
        </form>
      ) : null}

      {hasColumns ? (
        <StatementGrid
          rows={rows}
          years={gridYears}
          onCommit={(fy, id, value) => void handleCommit(fy, id, value)}
          onScaleChange={(fy, scale) => void handleScaleChange(fy, scale)}
          focusCell={localFocus ?? focusTarget}
        />
      ) : null}
    </>
  );
}
