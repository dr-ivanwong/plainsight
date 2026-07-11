/**
 * The client storage layer (data-model spec §9): the Dexie schema, the Zod
 * record boundary, and quarantine-on-read. Screens and hooks import from here.
 */
export { PlainsightDb, TABLE_NAMES, db, type TableName } from './db';
export {
  companyRecordSchema,
  entryValueSchema,
  financialsSnapshotSchema,
  flagDismissalRecordSchema,
  metaRecordSchema,
  priceRecordSchema,
  provenanceSchema,
  providerCredentialRecordSchema,
  quarantineRecordSchema,
  statementRecordSchema,
  thesisRecordSchema,
  thesisVersionRecordSchema,
  type CompanyRecord,
  type FinancialsSnapshot,
  type FlagDismissalRecord,
  type MetaKey,
  type MetaRecord,
  type PriceRecord,
  type ProviderCredentialRecord,
  type QuarantineRecord,
  type StatementRecord,
  type ThesisRecord,
  type ThesisSections,
  type ThesisVersionRecord
} from './records';
export { validateRow, validateRows, type ValidatedTableName } from './safeRead';
