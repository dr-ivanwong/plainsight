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
  updateCompanyDetails,
  type CompanyDetailsEdit,
  type NewCompany
} from './companies';
export {
  isSectorId,
  normaliseSector,
  SECTOR_IDS,
  SECTOR_LABELS,
  type SectorId
} from './sectors';
export { listStatements, upsertStatement, upsertStatements, type StatementWrite } from './statements';
export { getPrice, putPrice, type PriceWrite } from './prices';
export { getThesis, putThesisDraft, saveThesisVersion, type ThesisVersionWrite } from './theses';
export { deleteCredential, putCredential, type CredentialWrite } from './credentials';
export { getMeta, setMeta, type MetaValue } from './meta';
export { assembleFinancials } from './financials';
export {
  listDismissals,
  putDismissal,
  removeDismissal,
  type DismissalWrite
} from './dismissals';
export {
  applyImport,
  buildExport,
  dryRunCounts,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  exportFileSchema,
  parseExportFile,
  type CarriedSettings,
  type DryRunCounts,
  type ExportFile,
  type ParsedImport
} from './exportFile';
export { downloadLibraryExport, downloadText } from './exportDownload';
export { removeSampleData, wipeEverything } from './maintenance';
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
export {
  moveToQuarantine,
  partitionRows,
  validateRow,
  validateRows,
  type InvalidRow,
  type PartitionedRows,
  type ValidatedTableName
} from './safeRead';
