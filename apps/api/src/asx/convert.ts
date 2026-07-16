/**
 * Extraction output to canonical years: the ASX counterpart of the EDGAR
 * mapping's final step. Values arrive as printed (signed, at the stated
 * scale) with per-field confidence and pages; here they become integer minor
 * units under the same disciplines the mapping enforces, plus the one check
 * only extracted data can have: where the filing printed a diluted EPS, the
 * transcribed net income over the share count must reproduce it, the same
 * print checksum that pins the golden corpus (data-model spec §11). The
 * pipeline never asserts the not-reported-zero state (three-state rule,
 * data-model spec §8): a notPrinted field stays absent on the wire, exactly
 * as the EDGAR mapping leaves undisclosed figures absent, and the user
 * asserts the zero in the grid where the reading is theirs to make.
 */
import {
  financialsStatementSchema,
  type FinancialsStatement
} from '@plainsight/api-contract';
import {
  isFyLabel,
  LINE_ITEMS,
  scaleUnitMinor,
  type CurrencyCode,
  type FyLabel,
  type LineItemId,
  type StatementKind
} from '@plainsight/calc-engine';
import type { ExtractedYear, ExtractionProvenance, ExtractionResult } from '@plainsight/extraction-core';

import { displayAnnouncementUrl } from './client.js';

export interface ConvertedItem {
  amountMinor: number;
  confidence: number;
  page?: number | undefined;
}

export interface ConvertedYear {
  fy: FyLabel;
  endDate: string;
  currency: CurrencyCode;
  items: Partial<Record<LineItemId, ConvertedItem>>;
}

export interface ConversionFailure {
  fy: string;
  reasons: string[];
}

export interface ConversionOutcome {
  years: ConvertedYear[];
  failures: ConversionFailure[];
}

/**
 * The printed-EPS tolerance: half the printed grain plus a 0.5% relative
 * allowance. The corpus's worst legitimate drift is 0.15% (a restated
 * comparative whose EPS row was never recomputed); a transposed digit in net
 * income or the share count lands whole percent off.
 */
function epsMismatchReason(year: ExtractedYear, netIncomeMinor: number, shares: number): string | undefined {
  if (year.dilutedEps === undefined || shares <= 0) return undefined;
  const printed = year.dilutedEps.value;
  const unitFactor = year.dilutedEps.unit === 'cents' ? 100 : 1;
  const computed = (netIncomeMinor / 100 / shares) * unitFactor;
  const decimals = (String(printed).split('.')[1] ?? '').length;
  const tolerance = 0.5 * 10 ** -decimals + Math.abs(printed) * 0.005;
  if (Math.abs(computed - printed) <= tolerance) return undefined;
  return `printed diluted EPS ${printed} does not reproduce from net income over diluted shares (computed ${computed.toFixed(decimals + 2)}); a transcription error in one of the three`;
}

/** One extracted year to minor units, or the reasons it cannot be served. */
export function convertExtractedYear(year: ExtractedYear): { year: ConvertedYear } | { failure: ConversionFailure } {
  const reasons: string[] = [];
  if (!isFyLabel(year.fy)) {
    return { failure: { fy: year.fy, reasons: [`${year.fy} is not a fiscal-year label`] } };
  }
  const scaleMinor = scaleUnitMinor(year.scale);
  const items: Partial<Record<LineItemId, ConvertedItem>> = {};

  for (const [id, field] of Object.entries(year.fields) as [
    LineItemId,
    ExtractedYear['fields'][LineItemId]
  ][]) {
    if (field === undefined || 'notPrinted' in field) continue;
    // Share counts are exact counts whatever scale the money columns use.
    const amountMinor = id === 'dilutedShares' ? Math.round(field.value) : Math.round(field.value * scaleMinor);
    if (!Number.isSafeInteger(amountMinor)) {
      reasons.push(`${id} does not fit integer minor units at scale ${year.scale}`);
      continue;
    }
    if (!LINE_ITEMS[id].signed && amountMinor < 0) {
      reasons.push(`${id} extracted negative but is an unsigned magnitude`);
      continue;
    }
    items[id] = {
      amountMinor,
      confidence: field.confidence,
      ...(field.page === undefined ? {} : { page: field.page })
    };
  }

  const netIncome = items.netIncome?.amountMinor;
  const shares = items.dilutedShares?.amountMinor;
  if (netIncome !== undefined && shares !== undefined) {
    const mismatch = epsMismatchReason(year, netIncome, shares);
    if (mismatch !== undefined) reasons.push(mismatch);
  }

  if (reasons.length > 0) return { failure: { fy: year.fy, reasons } };
  return { year: { fy: year.fy, endDate: year.endDate, currency: year.currency, items } };
}

export function convertExtraction(result: ExtractionResult): ConversionOutcome {
  const years: ConvertedYear[] = [];
  const failures: ConversionFailure[] = [];
  for (const extracted of result.years) {
    const converted = convertExtractedYear(extracted);
    if ('year' in converted) years.push(converted.year);
    else failures.push(converted.failure);
  }
  return { years, failures };
}

/**
 * Wire rows for one converted year, carrying the full trust chain: the MAP
 * filing reference and the extraction reference with field-level confidence
 * and printed pages (backend spec §6), which is what tap-to-source cites.
 */
export function toAsxStatementRows(
  year: ConvertedYear,
  opts: { documentId: string; recordedAt: string; extraction: ExtractionProvenance }
): FinancialsStatement[] {
  const rows: FinancialsStatement[] = [];
  for (const statement of ['income', 'balance', 'cashflow'] as StatementKind[]) {
    const entries = (Object.entries(year.items) as [LineItemId, ConvertedItem][]).filter(
      ([id]) => LINE_ITEMS[id].statement === statement
    );
    if (entries.length === 0) continue;
    rows.push(
      financialsStatementSchema.parse({
        fy: year.fy,
        statement,
        endDate: year.endDate,
        currency: year.currency,
        values: Object.fromEntries(entries.map(([id, item]) => [id, item.amountMinor])),
        provenance: {
          source: 'asx_map',
          recordedAt: opts.recordedAt,
          filing: {
            system: 'ASX_MAP',
            documentId: opts.documentId,
            url: displayAnnouncementUrl(opts.documentId)
          },
          extraction: {
            provider: opts.extraction.provider,
            model: opts.extraction.model,
            promptVersion: opts.extraction.promptVersion,
            fields: Object.fromEntries(
              entries.map(([id, item]) => [
                id,
                {
                  confidence: item.confidence,
                  ...(item.page === undefined ? {} : { page: item.page })
                }
              ])
            )
          },
          mappingVersion: opts.extraction.promptVersion
        }
      })
    );
  }
  return rows;
}
