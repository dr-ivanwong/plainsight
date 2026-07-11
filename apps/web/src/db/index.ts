/**
 * The client storage layer (data-model spec §9): the Dexie schema, the Zod
 * record boundary, quarantine-on-read, the per-table repositories, and the
 * assembler that turns stored rows into engine input. Screens and hooks
 * import from here.
 */
export { PlainsightDb, TABLE_NAMES, db, type TableName } from './db';
export {
  bumpDataVersion,
  createCompany,
  getCompany,
  listCompanies,
  type NewCompany
} from './companies';
export { listStatements, upsertStatement, type StatementWrite } from './statements';
export { getPrice, putPrice, type PriceWrite } from './prices';
export { getMeta, setMeta, type MetaValue } from './meta';
export { assembleFinancials } from './financials';
export {
  companyRecordSchema,
  entryValueSchema,
  financialsSnapshotSchema,
  fyLabelSchema,
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
