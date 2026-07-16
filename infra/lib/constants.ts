import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/**
 * Shared log-retention default for every log group from Phase 2 on (spec §5:
 * a missing retention is the quietest cost leak in AWS; 30 days is the
 * project-wide answer). Exported from Phase 0 so later phases import it
 * rather than re-invent it. No Phase 0 stack has anything that logs, so it
 * is intentionally unused until the first Lambda lands.
 */
export const LOG_RETENTION = RetentionDays.ONE_MONTH;

/**
 * The EDGAR contact address (SEC fair-access requirement) is configuration
 * that must never be hardcoded in the repository (backend spec §9), so it
 * lives in a plain SSM parameter created out-of-band and read at runtime by
 * name, the same pattern as the pipeline's provider keys (cdk spec §1.4).
 * Read by the ingest function and by ticker search's SEC fallback.
 */
/**
 * The extraction provider key parameters live under this prefix, one
 * SecureString per rung, created out-of-band (never in code or state); the
 * registry in extraction-core names each rung's parameter and the ladder
 * skips rungs whose parameter does not exist.
 */
export const extractionParameterPrefix = (envName: string): string =>
  `/app/${envName}/extraction/`;

export const edgarContactParameterName = (envName: string): string =>
  `/app/${envName}/edgar/contact`;

/**
 * Where the search index copy lives in the artefacts bucket (backend spec
 * §8): the SEC's company_tickers_exchange.json, verbatim. The weekly sweep
 * refreshes it; the search Lambda reads it (and bootstraps it on first miss).
 * The handlers receive it by environment variable so this constant is the
 * single source.
 */
export const TICKER_INDEX_OBJECT_KEY = 'edgar/company_tickers_exchange.json';

/** The ASX listed-companies directory copy, refreshed beside the SEC index. */
export const ASX_DIRECTORY_OBJECT_KEY = 'asx/listed-companies.json';

/**
 * Where StaticSite publishes the distribution id once the API rides behind
 * CloudFront. The ingest function reads it at runtime to invalidate a
 * ticker's financials path after accepted writes (backend spec §5); reading
 * by name keeps the stacks acyclic, because StaticSite depends on Api and
 * so can never be referenced from the ingestion side at deploy time.
 */
export const distributionIdParameterName = (envName: string): string =>
  `/app/${envName}/cloudfront/distribution-id`;
