/**
 * Zod schemas for every stored record: the Dexie-to-app boundary (data-model
 * spec §9). Every read passes these; a record that fails moves to the
 * quarantine table (safeRead.ts) and never crashes a screen. Where the engine
 * already pins a shape (line items, entry values, provenance), the schemas are
 * built from the engine's own constants so storage cannot drift from the
 * dictionary.
 *
 * Object schemas deliberately strip unknown keys instead of rejecting them:
 * migrations are additive-first (data-model spec §9), so a record carrying a
 * field this version does not know about is healthy, not corrupt.
 */
import {
  isFyLabel,
  LINE_ITEMS,
  LINE_ITEM_IDS,
  RULE_IDS,
  STATEMENT_KINDS,
  type EntryValue,
  type FyLabel,
  type LineItemId,
  type Provenance,
  type Scale
} from '@plainsight/calc-engine';
import { z } from 'zod';

import { normaliseSector } from './sectors';

/** z.enum over the engine's runtime id lists, which are typed as widened readonly arrays. */
const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

const nonEmpty = z.string().min(1);
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'expected an ISO 4217 code like USD');

export const fyLabelSchema = z.custom<FyLabel>(
  (value) => typeof value === 'string' && isFyLabel(value),
  'expected a fiscal-year label like FY2024'
);

/**
 * Money is integer minor units with safe-integer bounds asserted at the
 * boundary (money policy, data-model spec §4); NaN, Infinity, floats and
 * unsafe integers are unrepresentable in storage.
 */
const integerMinor = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

/** A manually entered price is positive by construction; zero is degenerate for every valuation metric. */
const positiveMinor = integerMinor.min(1);

const scaleEnum = enumOf<Scale>(['ones', 'thousands', 'millions', 'billions']);

export const entryValueSchema: z.ZodType<EntryValue> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entered'), amountMinor: integerMinor }),
  z.object({ kind: z.literal('not_reported_zero') })
]);

const statementValues = z.partialRecord(enumOf(LINE_ITEM_IDS), entryValueSchema);

const filingRef = z.object({
  system: enumOf(['EDGAR', 'ASX_MAP']),
  documentId: nonEmpty,
  url: z.url().optional()
});

const extractionField = z.object({
  confidence: z.number().min(0).max(1),
  page: z.number().int().positive().optional(),
  cell: nonEmpty.optional()
});

const extractionRef = z.object({
  provider: nonEmpty,
  model: nonEmpty,
  promptVersion: nonEmpty,
  fields: z.partialRecord(enumOf(LINE_ITEM_IDS), extractionField).optional()
});

/** The pinned provenance shape (data-model spec §9); field-level page and cell references power tap-to-source. */
export const provenanceSchema: z.ZodType<Provenance> = z.object({
  source: enumOf(['manual', 'sample', 'edgar', 'asx_map', 'user_upload']),
  recordedAt: isoDateTime,
  filing: filingRef.optional(),
  extraction: extractionRef.optional(),
  mappingVersion: nonEmpty.optional()
});

export const companyRecordSchema = z.object({
  id: nonEmpty,
  name: nonEmpty,
  ticker: nonEmpty.optional(),
  exchange: nonEmpty.optional(),
  /**
   * An id from the pinned vocabulary or absent (data-model spec §12). The
   * transform is the normalisation boundary: legacy free-text values map to
   * their id and unknown strings clear to absent, here rather than per read
   * site, so Dexie-on-read, sync pull and file import all normalise and none
   * of them quarantines a row over a cosmetic label.
   */
  sector: z.string().transform(normaliseSector).optional(),
  currency: currencyCode,
  sample: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** Increments in the same transaction as any statements or prices write for the company (data-model spec §9). */
  dataVersion: z.number().int().nonnegative()
});

export type CompanyRecord = z.infer<typeof companyRecordSchema>;

/**
 * One row per company, fiscal year and statement. Beyond the field shapes, two
 * storage invariants hold per value: the item must belong to the row's
 * statement, and unsigned items are stored as positive magnitudes (sign
 * conventions, data-model spec §4).
 */
export const statementRecordSchema = z
  .object({
    companyId: nonEmpty,
    fy: fyLabelSchema,
    statement: enumOf(STATEMENT_KINDS),
    endDate: isoDate,
    entryScale: scaleEnum,
    values: statementValues,
    provenance: provenanceSchema,
    updatedAt: isoDateTime
  })
  .superRefine((record, ctx) => {
    for (const [id, value] of Object.entries(record.values) as [LineItemId, EntryValue][]) {
      const meta = LINE_ITEMS[id];
      if (meta.statement !== record.statement) {
        ctx.addIssue({
          code: 'custom',
          path: ['values', id],
          message: `${id} belongs on the ${meta.statement} statement, not ${record.statement}`
        });
      }
      if (!meta.signed && value.kind === 'entered' && value.amountMinor < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['values', id],
          message: `${id} is stored as a positive magnitude (sign conventions, data-model spec §4)`
        });
      }
    }
  });

export type StatementRecord = z.infer<typeof statementRecordSchema>;

export const priceRecordSchema = z.object({
  companyId: nonEmpty,
  amountMinor: positiveMinor,
  currency: currencyCode,
  asOf: isoDate,
  updatedAt: isoDateTime
});

export type PriceRecord = z.infer<typeof priceRecordSchema>;

/** The four structured thesis sections (frontend spec §3); empty strings are unwritten sections. */
const thesisSections = z.object({
  business: z.string(),
  moat: z.string(),
  valuation: z.string(),
  kills: z.string()
});

export type ThesisSections = z.infer<typeof thesisSections>;

export const thesisRecordSchema = z.object({
  companyId: nonEmpty,
  sections: thesisSections,
  updatedAt: isoDateTime
});

export type ThesisRecord = z.infer<typeof thesisRecordSchema>;

/**
 * The optional financials snapshot attached to a thesis version is the engine's
 * input shape (years plus price), so a saved version can re-render the metrics
 * exactly as they stood when the thesis was written.
 */
const snapshotYear = z.object({
  fy: fyLabelSchema,
  endDate: isoDate,
  currency: currencyCode,
  entryScale: scaleEnum,
  values: statementValues,
  provenance: provenanceSchema.optional()
});

export const financialsSnapshotSchema = z.object({
  years: z.array(snapshotYear),
  price: z.object({ amountMinor: positiveMinor, currency: currencyCode, asOf: isoDate }).optional()
});

export type FinancialsSnapshot = z.infer<typeof financialsSnapshotSchema>;

export const thesisVersionRecordSchema = z.object({
  id: z.number().int().positive(),
  companyId: nonEmpty,
  savedAt: isoDateTime,
  sections: thesisSections,
  financialsSnapshot: financialsSnapshotSchema.optional()
});

export type ThesisVersionRecord = z.infer<typeof thesisVersionRecordSchema>;

/**
 * Dismissals are keyed by company and rule, and remembered against the latest
 * fiscal year at dismissal time: a new year invalidates the dismissal and the
 * rule re-evaluates (data-model spec §7).
 */
export const flagDismissalRecordSchema = z.object({
  companyId: nonEmpty,
  ruleId: enumOf(RULE_IDS),
  dismissedAtFy: fyLabelSchema,
  dismissedAt: isoDateTime
});

export type FlagDismissalRecord = z.infer<typeof flagDismissalRecordSchema>;

/** Never exported and never synced: the export format's allowlist cannot reach this table (data-model spec §5). */
export const providerCredentialRecordSchema = z.object({
  providerId: nonEmpty,
  key: nonEmpty,
  label: z.string(),
  addedAt: isoDateTime
});

export type ProviderCredentialRecord = z.infer<typeof providerCredentialRecordSchema>;

/**
 * Where records failing Zod-on-read land, raw and untouched, for the data
 * screen's per-record export or discard. Quarantine rows themselves are read
 * permissively; they never re-quarantine.
 */
export const quarantineRecordSchema = z.object({
  id: z.number().int().positive(),
  table: nonEmpty,
  raw: z.unknown(),
  reason: nonEmpty,
  quarantinedAt: isoDateTime
});

export type QuarantineRecord = z.infer<typeof quarantineRecordSchema>;

/**
 * The sync shadow row (backend spec §4, client side): what this device last
 * pushed or applied for one record. The fingerprint is the record's own
 * change stamp; a mismatch is the definition of locally dirty. The device id
 * completes the spec's (lamport, deviceId) pair, which the pull comparison
 * needs for the equal-Lamport tiebreak; it is absent on shadows written
 * before the tiebreak landed, and equal Lamport then reads as already-seen.
 */
export interface SyncStateRecord {
  recordKey: string;
  lastLamport: number;
  lastDeviceId?: string;
  fingerprint: string;
}

/** Small app-level settings, one row per pinned key; a typed union keeps every value shape legal by construction. */
export const metaRecordSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('onboardingDone'), value: z.boolean() }),
  z.object({ key: z.literal('lastExportAt'), value: isoDateTime }),
  z.object({ key: z.literal('theme'), value: enumOf(['auto', 'light', 'dark']) }),
  z.object({ key: z.literal('educationLayerOff'), value: z.boolean() }),
  z.object({ key: z.literal('schemaVersion'), value: z.number().int().positive() }),
  z.object({ key: z.literal('sampleBannerDismissed'), value: z.boolean() }),
  z.object({ key: z.literal('iosInstallDismissed'), value: z.boolean() }),
  z.object({ key: z.literal('thesisSerif'), value: z.boolean() }),
  // The dashboard's cards-or-table choice (dashboard design plan §5.4).
  // Device preference like the serif toggle: not in the export allowlist.
  z.object({ key: z.literal('dashboardTableView'), value: z.boolean() }),
  // The sync engine's device-local facts (backend spec §4): the device id,
  // the Lamport clock, the pull checkpoint, and the quiet status line. None
  // sit in the export allowlist; they describe this device, not the library.
  z.object({ key: z.literal('deviceId'), value: z.string().min(1) }),
  z.object({ key: z.literal('lamportClock'), value: z.number().int().nonnegative() }),
  z.object({ key: z.literal('syncCheckpoint'), value: z.number().int().nonnegative() }),
  z.object({ key: z.literal('lastSyncedAt'), value: isoDateTime }),
  // The device's hosted-UI session (auth module). Device-local by
  // construction: not in the export allowlist, never a sync record type.
  z.object({
    key: z.literal('authSession'),
    value: z.object({
      idToken: z.string().min(1),
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
      /** Epoch milliseconds; refresh happens shortly before. */
      expiresAt: z.number().int().positive(),
      email: z.string()
    })
  })
]);

export type MetaRecord = z.infer<typeof metaRecordSchema>;
export type MetaKey = MetaRecord['key'];
