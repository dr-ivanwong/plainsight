/**
 * @plainsight/calc-engine: the pure calculation engine.
 * Build contract: docs/plan/plainsight-data-model.md. Zero dependencies, no
 * I/O, no DOM; (statements) -> MetricsReport.
 */
export {
  LINE_ITEMS,
  LINE_ITEM_IDS,
  STATEMENT_KINDS,
  coreItemsFor,
  type LineItemId,
  type LineItemMeta,
  type LineItemRole,
  type StatementKind
} from './lineItems.js';

export type {
  Basis,
  CompanyFinancials,
  CurrencyCode,
  EntryValue,
  ExtractionRef,
  FilingRef,
  FyLabel,
  MetricDelta,
  MetricFormat,
  MetricId,
  MetricSeries,
  MetricValue,
  MetricsReport,
  NotMeaningfulReason,
  PriceRecord,
  Provenance,
  RuleId,
  RuleResult,
  Scale,
  Severity,
  StatementYear
} from './types.js';

export { compareFyLabels, fyLabelFromEndDate, fyLabelOf, fyYear, parseIsoDate } from './fy.js';

export { assertSafeInteger, scaleUnitMinor } from './money.js';

export {
  balanceSheetComplete,
  hasValue,
  missingCoreItems,
  missingForMetric,
  requireValue,
  resolvedValue,
  statementComplete,
  yearComplete
} from './values.js';

export { checkIdentities, toleranceMinor, type GateId, type GateResult } from './gates.js';

export {
  METRICS,
  METRIC_IDS,
  buildSeries,
  computeMetric,
  effectiveTaxRate,
  type MetricContext,
  type MetricDef
} from './metrics.js';

export { evaluateRules, type RuleInput } from './rules.js';

export { computeMetricsReport } from './report.js';

export {
  NOT_MEANINGFUL_PHRASES,
  formatCoverage,
  formatMetricValue,
  formatMoneyMinor,
  formatPercent,
  formatRatio,
  type DisplayKind
} from './format.js';
