/**
 * The export and import format (data-model spec §5). The exporter enumerates
 * exactly six tables plus carried settings: an allowlist, not a blocklist, so
 * providerCredentials and quarantine cannot appear in an export by
 * construction. Every exported row passes its schema on the way out (a
 * corrupt row moves to quarantine rather than poisoning the file), and every
 * imported row passes it on the way in before anything is written.
 */
import { z } from 'zod';

import type { PlainsightDb } from './db';
import { getMeta, setMeta } from './meta';
import {
  benchmarkRecordSchema,
  companyRecordSchema,
  flagDismissalRecordSchema,
  priceRecordSchema,
  statementRecordSchema,
  thesisRecordSchema,
  thesisVersionRecordSchema
} from './records';
import { validateRows } from './safeRead';

export const EXPORT_FORMAT = 'plainsight-export';
export const EXPORT_FORMAT_VERSION = 1;

/** The preference keys a library carries between devices. */
const CARRIED_SETTINGS = [
  'theme',
  'educationLayerOff',
  'onboardingDone',
  'sampleBannerDismissed'
] as const;

const carriedSettingsSchema = z.object({
  theme: z.enum(['auto', 'light', 'dark']).optional(),
  educationLayerOff: z.boolean().optional(),
  onboardingDone: z.boolean().optional(),
  sampleBannerDismissed: z.boolean().optional()
});

export type CarriedSettings = z.infer<typeof carriedSettingsSchema>;

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.number().int().positive(),
  exportedAt: z.iso.datetime({ offset: true }),
  appVersion: z.string(),
  data: z.object({
    companies: z.array(companyRecordSchema),
    statements: z.array(statementRecordSchema),
    prices: z.array(priceRecordSchema),
    theses: z.array(thesisRecordSchema),
    thesisVersions: z.array(thesisVersionRecordSchema),
    flagDismissals: z.array(flagDismissalRecordSchema),
    // Additive 2026-07-22 (dashboard design plan §6.5): optional so files
    // from before the reference lines still import; the format version holds.
    benchmarks: z.array(benchmarkRecordSchema).optional(),
    settings: carriedSettingsSchema
  })
});

export type ExportFile = z.infer<typeof exportFileSchema>;

export async function buildExport(db: PlainsightDb, appVersion: string): Promise<ExportFile> {
  const [companies, statements, prices, theses, thesisVersions, flagDismissals, benchmarks] =
    await Promise.all([
      db.companies.toArray().then((rows) => validateRows(db, 'companies', rows, companyRecordSchema)),
      db.statements.toArray().then((rows) => validateRows(db, 'statements', rows, statementRecordSchema)),
      db.prices.toArray().then((rows) => validateRows(db, 'prices', rows, priceRecordSchema)),
      db.theses.toArray().then((rows) => validateRows(db, 'theses', rows, thesisRecordSchema)),
      db.thesisVersions
        .toArray()
        .then((rows) => validateRows(db, 'thesisVersions', rows, thesisVersionRecordSchema)),
      db.flagDismissals
        .toArray()
        .then((rows) => validateRows(db, 'flagDismissals', rows, flagDismissalRecordSchema)),
      db.benchmarks
        .toArray()
        .then((rows) => validateRows(db, 'benchmarks', rows, benchmarkRecordSchema))
    ]);

  const settings: CarriedSettings = {};
  for (const key of CARRIED_SETTINGS) {
    const value = await getMeta(db, key);
    if (value !== undefined) {
      // The carried keys share the boolean-or-theme value space; the schema
      // parse below is the final arbiter.
      (settings as Record<string, unknown>)[key] = value;
    }
  }

  return exportFileSchema.parse({
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    data: {
      companies,
      statements,
      prices,
      theses,
      thesisVersions,
      flagDismissals,
      benchmarks,
      settings
    }
  });
}

export type ParsedImport =
  | { ok: true; file: ExportFile }
  | { ok: false; reason: 'not-plainsight' | 'newer-version' | 'invalid-records' };

const envelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.number().int().positive()
});

/** Parse order per the spec: recognise the envelope, gate the version, then validate every record. */
export function parseExportFile(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-plainsight' };
  }
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, reason: 'not-plainsight' };
  if (envelope.data.formatVersion > EXPORT_FORMAT_VERSION) {
    return { ok: false, reason: 'newer-version' };
  }
  const file = exportFileSchema.safeParse(raw);
  if (!file.success) return { ok: false, reason: 'invalid-records' };
  return { ok: true, file: file.data };
}

export interface DryRunCounts {
  companies: number;
  fiscalYears: number;
  prices: number;
  theses: number;
  thesisVersions: number;
  flagDismissals: number;
}

export function dryRunCounts(file: ExportFile): DryRunCounts {
  const fiscalYears = new Set(
    file.data.statements.map((row) => `${row.companyId}|${row.fy}`)
  ).size;
  return {
    companies: file.data.companies.length,
    fiscalYears,
    prices: file.data.prices.length,
    theses: file.data.theses.length,
    thesisVersions: file.data.thesisVersions.length,
    flagDismissals: file.data.flagDismissals.length
  };
}

/** Newer updatedAt wins; ISO strings compare lexicographically. */
const isNewer = (incoming: string, existing: unknown): boolean =>
  typeof existing !== 'string' || existing < incoming;

export async function applyImport(
  db: PlainsightDb,
  file: ExportFile,
  mode: 'merge' | 'replace'
): Promise<void> {
  const {
    companies,
    statements,
    prices,
    theses,
    thesisVersions,
    flagDismissals,
    benchmarks,
    settings
  } = file.data;
  await db.transaction(
    'rw',
    [
      db.companies,
      db.statements,
      db.prices,
      db.theses,
      db.thesisVersions,
      db.flagDismissals,
      db.benchmarks,
      db.meta
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.companies.clear(),
          db.statements.clear(),
          db.prices.clear(),
          db.theses.clear(),
          db.thesisVersions.clear(),
          db.flagDismissals.clear()
        ]);
        await db.companies.bulkPut(companies);
        await db.statements.bulkPut(statements);
        await db.prices.bulkPut(prices);
        await db.theses.bulkPut(theses);
        await db.thesisVersions.bulkPut(thesisVersions);
        await db.flagDismissals.bulkPut(flagDismissals);
        // Benchmarks replace only when the file carries them: a file from
        // before the reference lines says nothing about them, and replace
        // should not read silence as an instruction to wipe the user's stance.
        if (benchmarks !== undefined) {
          await db.benchmarks.clear();
          await db.benchmarks.bulkPut(benchmarks);
        }
      } else {
        for (const row of companies) {
          const existing = await db.companies.get(row.id);
          if (existing === undefined || isNewer(row.updatedAt, existing.updatedAt)) {
            await db.companies.put(row);
          }
        }
        for (const row of statements) {
          const existing = await db.statements.get([row.companyId, row.fy, row.statement]);
          if (existing === undefined || isNewer(row.updatedAt, existing.updatedAt)) {
            await db.statements.put(row);
          }
        }
        for (const row of prices) {
          const existing = await db.prices.get(row.companyId);
          if (existing === undefined || isNewer(row.updatedAt, existing.updatedAt)) {
            await db.prices.put(row);
          }
        }
        for (const row of theses) {
          const existing = await db.theses.get(row.companyId);
          if (existing === undefined || isNewer(row.updatedAt, existing.updatedAt)) {
            await db.theses.put(row);
          }
        }
        // Versions are immutable snapshots and auto-increment ids never agree
        // across devices, so identity is the company plus the moment saved.
        const seen = new Set(
          (await db.thesisVersions.toArray()).map((row) => `${row.companyId}|${row.savedAt}`)
        );
        for (const row of thesisVersions) {
          if (!seen.has(`${row.companyId}|${row.savedAt}`)) {
            const { id: _incomingId, ...unnumbered } = row;
            await db.thesisVersions.add(unnumbered);
          }
        }
        for (const row of flagDismissals) {
          const existing = await db.flagDismissals.get([row.companyId, row.ruleId]);
          if (existing === undefined || isNewer(row.dismissedAt, existing.dismissedAt)) {
            await db.flagDismissals.put(row);
          }
        }
        for (const row of benchmarks ?? []) {
          const existing = await db.benchmarks.get(row.metricId);
          if (existing === undefined || isNewer(row.updatedAt, existing.updatedAt)) {
            await db.benchmarks.put(row);
          }
        }
      }

      for (const key of CARRIED_SETTINGS) {
        const value = settings[key];
        if (value === undefined) continue;
        if (mode === 'merge') {
          // Merge is conservative with preferences: fill gaps, never overwrite.
          const current = await db.meta.get(key);
          if (current !== undefined) continue;
        }
        await setMeta(db, key, value as never);
      }
    }
  );
}
