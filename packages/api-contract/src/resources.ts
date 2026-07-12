/**
 * Read-API response shapes (backend spec section 2's route table): the company
 * profile, the standardised annual statements with gaps, and ticker search.
 * Built from the engine's own constants so the wire cannot drift from the
 * dictionary, exactly as the client's storage schemas are.
 *
 * Wire values are bare integers in minor units (plain counts for
 * dilutedShares): the canonical pipeline only ever serves entered figures,
 * because only the user can assert the not-reported-zero state (data-model
 * spec §8). The client wraps them into entry values at its own boundary.
 */
import {
  isFyLabel,
  LINE_ITEMS,
  LINE_ITEM_IDS,
  STATEMENT_KINDS,
  type FyLabel,
  type LineItemId
} from '@plainsight/calc-engine';
import { z } from 'zod';

/** z.enum over the engine's runtime id lists, which are typed as widened readonly arrays. */
const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

const nonEmpty = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'expected an ISO 4217 code like USD');

export const fyLabelSchema = z.custom<FyLabel>(
  (value) => typeof value === 'string' && isFyLabel(value),
  'expected a fiscal-year label like FY2024'
);

/** Uppercase exchange tickers, dot and hyphen classes included (BRK-B, BF.B). */
export const tickerSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, 'expected an exchange ticker like AAPL or BRK-B');

/**
 * Integer minor units with safe-integer bounds asserted at the boundary
 * (money policy, data-model spec §4); floats, NaN and Infinity are
 * unrepresentable on the wire.
 */
const integerMinor = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const companyProfileSchema = z.object({
  ticker: tickerSchema,
  name: nonEmpty,
  cik: z.number().int().positive(),
  exchange: nonEmpty.optional(),
  sector: nonEmpty.optional(),
  currency: currencyCode
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

/**
 * Provenance as the canonical pipeline serves it: the trust chain is
 * mandatory, not optional, so a served row always names its filing and the
 * mapping version that read it (data-model spec §9; tap-to-see-source).
 * Phase 2 serves EDGAR only; the ASX MAP source widens this additively in
 * Phase 2.5.
 */
export const financialsProvenanceSchema = z.object({
  source: z.literal('edgar'),
  recordedAt: isoDateTime,
  filing: z.object({
    system: z.literal('EDGAR'),
    documentId: nonEmpty,
    url: z.url().optional()
  }),
  mappingVersion: nonEmpty
});

export type FinancialsProvenance = z.infer<typeof financialsProvenanceSchema>;

export const statementValuesSchema = z.partialRecord(enumOf(LINE_ITEM_IDS), integerMinor);

export type StatementValues = z.infer<typeof statementValuesSchema>;

/**
 * One served statement for one fiscal year, mirroring the client's storage
 * row. The same two invariants the client enforces hold on the wire: every
 * value belongs to the row's statement, and unsigned items are positive
 * magnitudes (sign conventions, data-model spec §4).
 */
export const financialsStatementSchema = z
  .object({
    fy: fyLabelSchema,
    statement: enumOf(STATEMENT_KINDS),
    endDate: isoDate,
    currency: currencyCode,
    values: statementValuesSchema,
    provenance: financialsProvenanceSchema
  })
  .superRefine((row, ctx) => {
    for (const [id, amount] of Object.entries(row.values) as [LineItemId, number][]) {
      const meta = LINE_ITEMS[id];
      if (meta.statement !== row.statement) {
        ctx.addIssue({
          code: 'custom',
          path: ['values', id],
          message: `${id} belongs on the ${meta.statement} statement, not ${row.statement}`
        });
      }
      if (!meta.signed && amount < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['values', id],
          message: `${id} is served as a positive magnitude (sign conventions, data-model spec §4)`
        });
      }
    }
  });

export type FinancialsStatement = z.infer<typeof financialsStatementSchema>;

/**
 * Partial data degrades, never 500s (backend spec section 2): a ticker with
 * eight of ten years serves eight years, and `gaps` names the labels missing
 * from the served range.
 */
export const financialsResponseSchema = z.object({
  ticker: tickerSchema,
  statements: z.array(financialsStatementSchema),
  gaps: z.array(fyLabelSchema)
});

export type FinancialsResponse = z.infer<typeof financialsResponseSchema>;

export const searchResultSchema = z.object({
  ticker: tickerSchema,
  name: nonEmpty,
  cik: z.number().int().positive(),
  exchange: nonEmpty.optional()
});

export type SearchResult = z.infer<typeof searchResultSchema>;

/** Pagination is opaque page tokens only, never offsets (backend spec section 2). */
export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  nextPageToken: nonEmpty.optional()
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
