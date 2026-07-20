/**
 * The pure heart of review mode (frontend spec §3): extracted printed values
 * become entry values exactly as a human typing from the same page would
 * make them, the identity gates run continuously over the effective figures,
 * and the save writes carry per-field extraction provenance for every figure
 * the reviewer did not overtype.
 */
import {
  checkIdentities,
  isFyLabel,
  LINE_ITEMS,
  scaleUnitMinor,
  type CurrencyCode,
  type EntryValue,
  type FyLabel,
  type GateResult,
  type LineItemId,
  type StatementKind,
  type StatementYear
} from '@plainsight/calc-engine';
import type { ExtractionProvenance, ExtractionResult } from '@plainsight/extraction-core';

import { unitOf } from '../../components/moneyEntry';
import type { StatementWrite } from '../../db';

export const CONFIRM_BELOW = 0.7;

export interface ReviewField {
  /** Stored units, or the printed-nil entry state. */
  readonly value: EntryValue;
  readonly confidence: number;
  readonly page?: number | undefined;
}

export interface ReviewYearModel {
  readonly fy: FyLabel;
  readonly endDate: string;
  readonly currency: string;
  readonly scale: StatementYear['entryScale'];
  readonly fields: Partial<Readonly<Record<LineItemId, ReviewField>>>;
  /**
   * Line items the model read as not printed in the document. A claim, not
   * a value: only the user asserts the not-reported-zero state (data-model
   * spec §8), so these seed nothing, gate nothing, and save nothing. The
   * grid shows the claim beside the empty cell, and the cell's own menu is
   * where the user agrees.
   */
  readonly notPrinted: ReadonlySet<LineItemId>;
}

/**
 * Printed values to stored units: money at the printed scale, share counts
 * exact (the schema pins that), everything rounded to the integer the store
 * demands. A `notPrinted` claim stays absent-with-a-hint rather than
 * becoming a value. A year whose label the engine cannot speak is dropped
 * rather than guessed.
 */
export function seedReview(result: ExtractionResult): ReviewYearModel[] {
  return result.years.flatMap((year) => {
    if (!isFyLabel(year.fy)) return [];
    const fields: Partial<Record<LineItemId, ReviewField>> = {};
    const notPrinted = new Set<LineItemId>();
    for (const [id, field] of Object.entries(year.fields) as [
      LineItemId,
      NonNullable<ExtractionResult['years'][number]['fields'][LineItemId]>
    ][]) {
      if ('notPrinted' in field) {
        notPrinted.add(id);
        continue;
      }
      const perUnit = unitOf(id) === 'count' ? 1 : scaleUnitMinor(year.scale);
      fields[id] = {
        value: { kind: 'entered', amountMinor: Math.round(field.value * perUnit) },
        confidence: field.confidence,
        page: field.page
      };
    }
    return [
      { fy: year.fy, endDate: year.endDate, currency: year.currency, scale: year.scale, fields, notPrinted }
    ];
  });
}

/** `${fy}|${id}`: the review's field key, shared by confirmations and edits. */
export const fieldKey = (fy: FyLabel, id: LineItemId): string => `${fy}|${id}`;

/** Edits override the seed; a cleared cell drops the field entirely. */
export type EditedValues = ReadonlyMap<string, EntryValue | null>;

export function effectiveValues(
  year: ReviewYearModel,
  edits: EditedValues
): Partial<Record<LineItemId, EntryValue>> {
  const values: Partial<Record<LineItemId, EntryValue>> = {};
  for (const [id, field] of Object.entries(year.fields) as [LineItemId, ReviewField][]) {
    values[id] = field.value;
  }
  for (const [key, value] of edits) {
    const [fy, id] = key.split('|') as [string, LineItemId];
    if (fy !== year.fy) continue;
    if (value === null) delete values[id];
    else values[id] = value;
  }
  return values;
}

/** Every field below the confirm threshold, keyed; edits satisfy their own key. */
export function requiredConfirmations(
  years: readonly ReviewYearModel[],
  edits: EditedValues
): string[] {
  return years.flatMap((year) =>
    (Object.entries(year.fields) as [LineItemId, ReviewField][])
      .filter(([id, field]) => field.confidence < CONFIRM_BELOW && !edits.has(fieldKey(year.fy, id)))
      .map(([id]) => fieldKey(year.fy, id))
  );
}

export interface YearGates {
  readonly fy: FyLabel;
  readonly results: GateResult[];
  readonly offenders: ReadonlySet<LineItemId>;
}

const GATE_ITEMS: Readonly<Record<GateResult['gate'], readonly LineItemId[]>> = {
  balance_sheet: ['totalAssets', 'totalLiabilities', 'totalEquity'],
  gross_profit: ['grossProfit', 'revenue', 'costOfRevenue']
};

/** The live gates over the effective figures; a breach names its fields, never a modal. */
export function gatesFor(years: readonly ReviewYearModel[], edits: EditedValues): YearGates[] {
  return years.map((year) => {
    const statementYear: StatementYear = {
      fy: year.fy,
      endDate: year.endDate,
      currency: year.currency as CurrencyCode,
      entryScale: year.scale,
      values: effectiveValues(year, edits)
    };
    const results = checkIdentities(statementYear);
    const offenders = new Set<LineItemId>(
      results
        .filter((result) => result.status === 'fail')
        .flatMap((result) => GATE_ITEMS[result.gate])
    );
    return { fy: year.fy, results, offenders };
  });
}

/**
 * The save writes: one per statement that extracted at least one field, the
 * effective figures as values, and per-field extraction provenance for
 * every figure the reviewer left as read; an overtyped figure is the
 * reviewer's own and carries no field entry.
 */
export function buildWrites(input: {
  companyId: string;
  years: readonly ReviewYearModel[];
  edits: EditedValues;
  provenance: ExtractionProvenance;
  recordedAt: string;
}): StatementWrite[] {
  const writes: StatementWrite[] = [];
  for (const year of input.years) {
    const values = effectiveValues(year, input.edits);
    const byStatement = new Map<StatementKind, LineItemId[]>();
    for (const id of Object.keys(values) as LineItemId[]) {
      const statement = LINE_ITEMS[id].statement;
      byStatement.set(statement, [...(byStatement.get(statement) ?? []), id]);
    }
    for (const [statement, ids] of byStatement) {
      const statementValues: Partial<Record<LineItemId, EntryValue>> = {};
      const fieldProvenance: Partial<Record<LineItemId, { confidence: number; page?: number }>> =
        {};
      for (const id of ids) {
        statementValues[id] = values[id] as EntryValue;
        const seeded = year.fields[id];
        if (seeded !== undefined && !input.edits.has(fieldKey(year.fy, id))) {
          fieldProvenance[id] = {
            confidence: seeded.confidence,
            ...(seeded.page === undefined ? {} : { page: seeded.page })
          };
        }
      }
      writes.push({
        companyId: input.companyId,
        fy: year.fy,
        statement,
        endDate: year.endDate,
        entryScale: year.scale,
        values: statementValues,
        provenance: {
          source: 'user_upload',
          recordedAt: input.recordedAt,
          extraction: {
            provider: input.provenance.provider,
            model: input.provenance.model,
            promptVersion: input.provenance.promptVersion,
            fields: fieldProvenance
          }
        }
      });
    }
  }
  return writes;
}
