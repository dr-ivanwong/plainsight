import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/**
 * Shared log-retention default for every log group from Phase 2 on (spec §5:
 * a missing retention is the quietest cost leak in AWS; 30 days is the
 * project-wide answer). Exported from Phase 0 so later phases import it
 * rather than re-invent it. No Phase 0 stack has anything that logs, so it
 * is intentionally unused until the first Lambda lands.
 */
export const LOG_RETENTION = RetentionDays.ONE_MONTH;
