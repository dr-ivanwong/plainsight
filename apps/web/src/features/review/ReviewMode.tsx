import {
  formatMoneyMinor,
  LINE_ITEM_IDS,
  LINE_ITEMS,
  type CurrencyCode,
  type EntryValue,
  type FyLabel,
  type LineItemId,
  type StatementKind
} from '@plainsight/calc-engine';
import { REGISTRY } from '@plainsight/extraction-core';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { AMBER_BELOW, ConfidenceBadge } from '../../components/ConfidenceBadge';
import type { FieldValue } from '../../components/MoneyField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SourcePeek, type SourcePeekState } from '../../components/SourcePeek';
import { StatementGrid, type GridYear } from '../../components/StatementGrid';
import { db, upsertStatements, type CompanyRecord } from '../../db';
import * as buttons from '../../styles/buttons.css';
import { sourcePageImage, type ExtractionJob } from './jobStore';
import * as styles from './reviewMode.css';
import {
  buildWrites,
  effectiveValues,
  fieldKey,
  gatesFor,
  requiredConfirmations,
  seedReview,
  type EditedValues
} from './reviewModel';

const STATEMENT_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'balance', label: 'Balance' },
  { value: 'cashflow', label: 'Cash flow' }
] as const;

const rungLabel = (rungId: string): string =>
  REGISTRY.find((entry) => entry.id === rungId)?.label ?? rungId;

const GATE_WORDS: Readonly<Record<'balance_sheet' | 'gross_profit', string>> = {
  balance_sheet: 'assets do not equal liabilities plus equity',
  gross_profit: 'gross profit does not equal revenue less cost of revenue'
};

type SucceededJob = Extract<ExtractionJob, { phase: 'succeeded' }>;

/**
 * Extraction review mode (frontend spec §3): the entry layout taken over by
 * the extracted grid. Confidence renders per the pinned bands, the identity
 * gates run continuously over the effective figures and mark offending
 * fields rather than raising a modal, and Save stays disabled until every
 * low-confidence field is confirmed and every gate passes. An overtyped
 * figure becomes the reviewer's own; everything else saves with its
 * per-field extraction provenance, which is what tap-to-source reads later.
 */
export function ReviewMode({
  company,
  job,
  onDone
}: {
  company: CompanyRecord;
  job: SucceededJob;
  onDone: () => void;
}): ReactElement {
  const [statement, setStatement] = useState<StatementKind>('income');
  const model = useMemo(() => seedReview(job.result), [job.result]);
  const [edits, setEdits] = useState<ReadonlyMap<string, EntryValue | null>>(new Map());
  const [confirmedKeys, setConfirmedKeys] = useState<ReadonlySet<string>>(new Set());
  const [discardArmed, setDiscardArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [peek, setPeek] = useState<{ id: LineItemId; page: number } | null>(null);
  const [peekState, setPeekState] = useState<SourcePeekState>({ kind: 'loading' });

  // The peek renders from the job's retained bytes, first ask only; a
  // closed-and-reopened page answers from the job's cache.
  useEffect(() => {
    if (peek === null) return;
    let stale = false;
    setPeekState({ kind: 'loading' });
    void sourcePageImage(job.id, peek.page).then((image) => {
      if (stale) return;
      setPeekState(image === null ? { kind: 'unavailable' } : { kind: 'ready', image });
    });
    return () => {
      stale = true;
    };
  }, [job.id, peek]);

  const gates = useMemo(() => gatesFor(model, edits), [model, edits]);
  const notPrintedCount = useMemo(
    () => model.reduce((count, year) => count + year.notPrinted.size, 0),
    [model]
  );
  const pending = useMemo(
    () => requiredConfirmations(model, edits).filter((key) => !confirmedKeys.has(key)),
    [model, edits, confirmedKeys]
  );

  const holdups: string[] = [];
  if (pending.length > 0) {
    holdups.push(
      `${pending.length} low-confidence ${pending.length === 1 ? 'figure needs' : 'figures need'} confirming.`
    );
  }
  for (const year of gates) {
    for (const result of year.results) {
      if (result.status === 'fail') {
        holdups.push(
          `${year.fy}: ${GATE_WORDS[result.gate]}, off by ${formatMoneyMinor(
            Math.abs(result.diffMinor),
            (model.find((candidate) => candidate.fy === year.fy)?.currency ??
              company.currency) as CurrencyCode
          )}.`
        );
      }
    }
  }
  for (const year of model) {
    if (year.currency !== company.currency) {
      holdups.push(
        `${year.fy} speaks ${year.currency}; this company keeps its books in ${company.currency}.`
      );
    }
  }

  const rows = LINE_ITEM_IDS.map((id) => LINE_ITEMS[id]).filter(
    (item) => item.statement === statement
  );
  const gridYears: GridYear[] = model.map((year) => ({
    fy: year.fy,
    entryScale: year.scale,
    currency: year.currency as CurrencyCode,
    values: effectiveValues(year, edits)
  }));

  const offendersByFy = new Map(gates.map((year) => [year.fy, year.offenders]));

  const acceptableHigh = model.flatMap((year) =>
    (Object.entries(year.fields) as [LineItemId, { confidence: number }][])
      .filter(([id, field]) => {
        const key = fieldKey(year.fy, id);
        return field.confidence >= AMBER_BELOW && !confirmedKeys.has(key) && !edits.has(key);
      })
      .map(([id]) => fieldKey(year.fy, id))
  );

  function handleCommit(fy: FyLabel, id: LineItemId, value: FieldValue): void {
    const entry: EntryValue | null =
      value === null
        ? null
        : value === 'zero'
          ? { kind: 'not_reported_zero' }
          : { kind: 'entered', amountMinor: value };
    setEdits((current) => new Map(current).set(fieldKey(fy, id), entry));
  }

  function cellTone(id: LineItemId, fy: FyLabel): 'amber' | 'breached' | undefined {
    if (offendersByFy.get(fy)?.has(id) === true) return 'breached';
    const year = model.find((candidate) => candidate.fy === fy);
    const field = year?.fields[id];
    const key = fieldKey(fy, id);
    if (
      field !== undefined &&
      field.confidence < AMBER_BELOW &&
      !edits.has(key) &&
      !confirmedKeys.has(key)
    ) {
      return 'amber';
    }
    return undefined;
  }

  function renderCellExtra(id: LineItemId, fy: FyLabel): ReactElement | null {
    const key = fieldKey(fy, id);
    const year = model.find((candidate) => candidate.fy === fy);
    const field = year?.fields[id];
    const pageRef =
      field?.page === undefined ? null : (
        <button
          type="button"
          className={styles.pageRef}
          aria-label={`Show source page ${field.page} for ${LINE_ITEMS[id].label}, ${fy}`}
          onClick={() => setPeek({ id, page: field.page as number })}
        >
          p. {field.page}
        </button>
      );
    if (edits.has(key)) {
      return (
        <span className={styles.cellExtras}>
          <span className={styles.edited}>edited</span>
          {pageRef}
        </span>
      );
    }
    if (field === undefined) {
      // The model's not-printed claim stays a hint on an empty cell: only
      // the user asserts the not-reported-zero state (data-model spec §8),
      // through this cell's own menu.
      if (year?.notPrinted.has(id) === true) {
        return (
          <span className={styles.cellExtras}>
            <span className={styles.hint}>not printed, per the model</span>
          </span>
        );
      }
      return null;
    }
    return (
      <span className={styles.cellExtras}>
        <ConfidenceBadge
          confidence={field.confidence}
          confirmed={confirmedKeys.has(key)}
          label={`${LINE_ITEMS[id].label}, ${fy}`}
          onConfirm={() => setConfirmedKeys((current) => new Set(current).add(key))}
        />
        {pageRef}
      </span>
    );
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveFailed(false);
    try {
      const writes = buildWrites({
        companyId: company.id,
        years: model,
        edits: edits as EditedValues,
        provenance: job.provenance,
        recordedAt: new Date().toISOString()
      });
      // One transaction across every statement: the failure banner below
      // says "Nothing was stored", and this is what makes that true.
      await upsertStatements(db, writes);
      onDone();
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  }

  const saveDisabled = saving || holdups.length > 0;

  return (
    <>
      <section className={styles.banner} aria-label="Extraction review">
        <p className={styles.bannerLine}>
          Extracted from <span className={styles.bannerName}>{job.fileName}</span> via{' '}
          <span className={styles.bannerName}>{rungLabel(job.provenance.provider)}</span>. Review
          before saving.
        </p>
        {(job.result.warnings ?? []).map((warning) => (
          <p key={warning} className={styles.warning}>
            {warning}
          </p>
        ))}
        {notPrintedCount === 0 ? null : (
          <p className={styles.warning}>
            The model reads {notPrintedCount} {notPrintedCount === 1 ? 'line' : 'lines'} as not
            printed in this document. Each stays empty unless you mark it yourself: Not reported
            → 0, in the field&apos;s menu.
          </p>
        )}
      </section>

      <div className={styles.toolbar}>
        <SegmentedControl
          label="Statement"
          options={STATEMENT_OPTIONS}
          value={statement}
          onChange={setStatement}
        />
        {acceptableHigh.length === 0 ? null : (
          <button
            type="button"
            className={styles.quietAction}
            onClick={() =>
              setConfirmedKeys((current) => new Set([...current, ...acceptableHigh]))
            }
          >
            Accept all ≥ 90%
          </button>
        )}
      </div>

      <div className={peek === null ? styles.layout : styles.layoutWithPeek}>
        {peek === null ? null : (
          // Wide screens: the source page beside the grid. Narrow ones get
          // the per-field row below instead; the media split picks one.
          <div className={styles.peekPane}>
            <SourcePeek
              fileName={job.fileName}
              page={peek.page}
              state={peekState}
              onClose={() => setPeek(null)}
            />
          </div>
        )}
        <StatementGrid
          rows={rows}
          years={gridYears}
          mode="review"
          onCommit={handleCommit}
          cellTone={cellTone}
          renderCellExtra={renderCellExtra}
          rowExtra={(id) =>
            peek === null || peek.id !== id ? null : (
              <div className={styles.peekRow}>
                <SourcePeek
                  fileName={job.fileName}
                  page={peek.page}
                  state={peekState}
                  onClose={() => setPeek(null)}
                />
              </div>
            )
          }
        />
      </div>

      <div className={styles.footer}>
        <p className={styles.holdup} role="status">
          {saveFailed ? 'Could not save. Nothing was stored.' : holdups.join(' ')}
        </p>
        {discardArmed ? (
          <>
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => setDiscardArmed(false)}
            >
              Keep reviewing
            </button>
            <button type="button" className={buttons.secondaryAction} onClick={onDone}>
              Discard the extraction
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.quietAction}
            onClick={() => setDiscardArmed(true)}
          >
            Discard
          </button>
        )}
        <button
          type="button"
          className={buttons.primaryAction}
          disabled={saveDisabled}
          onClick={() => void handleSave()}
        >
          Save to the library
        </button>
      </div>
    </>
  );
}
