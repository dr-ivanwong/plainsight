/**
 * The Dexie database: version 1 of the pinned client storage schema
 * (data-model spec §9). IndexedDB holds the synchronised working copy; the
 * backend is the source of truth (main plan §12.9), and every table's record
 * shape is validated on read by records.ts via safeRead.ts.
 *
 * Indexes are deliberately minimal: the library sorts companies by updatedAt,
 * per-company lookups go through companyId, and everything else queries by
 * primary key. The sample flag is filtered in code because booleans are not
 * valid IndexedDB keys.
 */
import Dexie, { type EntityTable, type Table } from 'dexie';

import { BENCHMARK_DEFAULTS } from './records';
import { normaliseSector } from './sectors';
import type {
  BenchmarkRecord,
  CompanyRecord,
  FlagDismissalRecord,
  MetaRecord,
  PriceRecord,
  ProviderCredentialRecord,
  QuarantineRecord,
  SyncStateRecord,
  StatementRecord,
  ThesisRecord,
  ThesisVersionRecord
} from './records';

export const TABLE_NAMES = [
  'companies',
  'statements',
  'prices',
  'theses',
  'thesisVersions',
  'flagDismissals',
  'providerCredentials',
  'quarantine',
  'meta',
  'syncState',
  'benchmarks'
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export class PlainsightDb extends Dexie {
  declare companies: Table<CompanyRecord, string>;
  declare statements: Table<StatementRecord, [string, string, string]>;
  declare prices: Table<PriceRecord, string>;
  declare theses: Table<ThesisRecord, string>;
  declare thesisVersions: EntityTable<ThesisVersionRecord, 'id'>;
  declare flagDismissals: Table<FlagDismissalRecord, [string, string]>;
  declare providerCredentials: Table<ProviderCredentialRecord, string>;
  declare quarantine: EntityTable<QuarantineRecord, 'id'>;
  declare meta: Table<MetaRecord, string>;
  declare syncState: Table<SyncStateRecord, string>;
  declare benchmarks: Table<BenchmarkRecord, string>;

  constructor(name = 'plainsight') {
    super(name);
    // A fresh database is created at the newest version, so the upgrade
    // callbacks never run for it; populate is where its defaults seed.
    this.on('populate', (tx) => {
      void tx.table('benchmarks').bulkAdd(seededBenchmarks());
    });
    this.version(1).stores({
      companies: 'id, updatedAt',
      statements: '[companyId+fy+statement], companyId',
      prices: 'companyId',
      theses: 'companyId',
      thesisVersions: '++id, companyId',
      flagDismissals: '[companyId+ruleId], companyId',
      providerCredentials: 'providerId',
      quarantine: '++id, table',
      meta: 'key'
    });
    // The sync shadow (backend spec §4, client side): per synced record, the
    // last lamport this device pushed or applied and the fingerprint it had
    // then. Purely additive: the engine diffs against it, and no existing
    // write path knows it exists.
    this.version(2).stores({
      syncState: 'recordKey'
    });
    // The sector vocabulary pass (data-model spec §12): known legacy
    // free-text sectors rewrite to their pinned id and unknown ones clear to
    // absent, ready for one-tap reassignment through the details sheet.
    // Rewritten rows bump updatedAt, so each one diffs against its sync
    // shadow and pushes like an ordinary edit; the server copy converges
    // (main plan §12.9). Rows already carrying an id, or nothing, stay
    // untouched and quiet.
    this.version(3).upgrade(async (tx) => {
      const now = new Date().toISOString();
      await tx
        .table('companies')
        .toCollection()
        .modify((row: { sector?: string; updatedAt?: string }) => {
          if (typeof row.sector !== 'string') return;
          const normalised = normaliseSector(row.sector);
          if (normalised === row.sector) return;
          if (normalised === undefined) delete row.sector;
          else row.sector = normalised;
          row.updatedAt = now;
        });
    });
    // The benchmark reference lines (dashboard design plan §6.5): one global
    // row per metric, seeded with the two owner-resolved defaults. Local and
    // exportable, never synced: a wire type would be a backend-spec change,
    // deliberately not taken with this table.
    this.version(4)
      .stores({
        benchmarks: 'metricId'
      })
      .upgrade(async (tx) => {
        await tx.table('benchmarks').bulkAdd(seededBenchmarks());
      });
    // The first-launch flag's retirement (main plan §12 entry 18): the
    // welcome flow left on 2026-07-22 and nothing reads or writes the key,
    // so this deletes the row a live device still carries. Deleted here
    // rather than merely dropped from the record union, because a row whose
    // key leaves the union would quarantine on its next read as noise.
    this.version(5).upgrade(async (tx) => {
      await tx.table('meta').delete('onboardingDone');
    });
  }
}

/** The pre-populated rows, stamped at seed time (records.ts pins the values). */
function seededBenchmarks(): BenchmarkRecord[] {
  const now = new Date().toISOString();
  return Object.entries(BENCHMARK_DEFAULTS).map(([metricId, value]) => ({
    metricId: metricId as BenchmarkRecord['metricId'],
    value,
    updatedAt: now
  }));
}

/** The app-wide database. Tests construct their own instances under throwaway names. */
export const db = new PlainsightDb();
