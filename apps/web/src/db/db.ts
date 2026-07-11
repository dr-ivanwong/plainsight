/**
 * The Dexie database: version 1 of the pinned client storage schema
 * (data-model spec §9). IndexedDB is the source of truth, not a cache; every
 * table's record shape is validated on read by records.ts via safeRead.ts.
 *
 * Indexes are deliberately minimal: the library sorts companies by updatedAt,
 * per-company lookups go through companyId, and everything else queries by
 * primary key. The sample flag is filtered in code because booleans are not
 * valid IndexedDB keys.
 */
import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  CompanyRecord,
  FlagDismissalRecord,
  MetaRecord,
  PriceRecord,
  ProviderCredentialRecord,
  QuarantineRecord,
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
  'meta'
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

  constructor(name = 'plainsight') {
    super(name);
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
  }
}

/** The app-wide database. Tests construct their own instances under throwaway names. */
export const db = new PlainsightDb();
