/**
 * Core engine types, pinned by docs/plan/plainsight-data-model.md section 3.
 * Shapes are the contract; discriminated unions make illegal states
 * unrepresentable end to end. NaN never reaches the UI because it never enters
 * a representable state.
 */
import type { LineItemId } from './lineItems.js';

export type CurrencyCode = string; // ISO 4217: 'USD', 'AUD'

export type Scale = 'ones' | 'thousands' | 'millions' | 'billions';

export type FyLabel = `FY${number}`; // P-3: 'FY2024'

/**
 * All money is integer minor units (cents). Number.isSafeInteger is asserted at
 * every boundary. An absent key in `StatementYear.values` is the third state:
 * unknown; never encoded as null or 0 (spec section 8).
 *
 * Non-monetary items (dilutedShares) reuse the same shape with `amountMinor`
 * holding the plain count in ones.
 */
export type EntryValue =
  | { kind: 'entered'; amountMinor: number }
  | { kind: 'not_reported_zero' }; // the "not reported -> 0" state, spec section 8

export interface FilingRef {
  system: 'EDGAR' | 'ASX_MAP';
  documentId: string;
  url?: string;
}

export interface ExtractionRef {
  provider: string;
  model: string;
  promptVersion: string;
  fields?: Partial<Record<LineItemId, { confidence: number; page?: number; cell?: string }>>;
}

/** Pinned provenance shape (spec section 9). */
export interface Provenance {
  source: 'manual' | 'sample' | 'edgar' | 'asx_map' | 'user_upload';
  recordedAt: string; // ISO datetime
  filing?: FilingRef;
  extraction?: ExtractionRef;
  mappingVersion?: string;
}

/**
 * One fiscal year of entered data, all statements merged. The client data layer
 * assembles this from its per-statement storage rows; the engine never does I/O.
 * Provenance is carried for the UI's benefit and is optional here because the
 * engine performs no computation with it.
 */
export interface StatementYear {
  fy: FyLabel;
  endDate: string; // ISO date, e.g. '2025-06-30'
  currency: CurrencyCode;
  entryScale: Scale; // UI convenience only; storage is minor units (P-1)
  values: Partial<Readonly<Record<LineItemId, EntryValue>>>;
  provenance?: Provenance;
}

/** The manual price record (N3): a sibling record, not a line item. */
export interface PriceRecord {
  amountMinor: number;
  currency: CurrencyCode;
  asOf: string; // ISO date
}

/** Engine input: everything needed to compute a company's MetricsReport. */
export interface CompanyFinancials {
  years: readonly StatementYear[];
  price?: PriceRecord;
}

export type NotMeaningfulReason =
  | 'negative_equity'
  | 'negative_earnings'
  | 'negative_invested_capital'
  | 'no_interest_expense'
  | 'zero_revenue'
  | 'zero_denominator'
  | 'no_price';

/** P-4 denominator basis, carried in the result and badged in the UI. */
export type Basis = 'average' | 'ending';

export type MetricValue =
  | { status: 'ok'; value: number; basis?: Basis }
  | { status: 'not_meaningful'; reason: NotMeaningfulReason }
  | { status: 'insufficient_data'; missing: LineItemId[] };

export type MetricId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10'
  | 'M11'
  | 'M12'
  | 'M13'
  | 'M14';

/** How a metric's ok value renders under P-2 display precision. */
export type MetricFormat = 'percent' | 'ratio' | 'coverage' | 'money';

/**
 * P-6: the delta chip compares the latest FY against the FY five labels prior,
 * and exists only when both endpoints compute.
 */
export interface MetricDelta {
  fromFy: FyLabel;
  toFy: FyLabel;
  /** Raw change in the metric's native unit (fraction for percents, ratio otherwise, minor units for money). */
  change: number;
  direction: 'up' | 'down' | 'flat';
}

export interface MetricSeries {
  id: MetricId;
  /** One entry per labelled year present in the input. */
  values: Partial<Record<FyLabel, MetricValue>>;
  /** The latest labelled year's value; null when the input has no years. */
  latest: MetricValue | null;
  delta: MetricDelta | null;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export type Severity = 'orange' | 'red';

/**
 * A fired red-flag rule (spec section 7). Rules that pass or abstain emit
 * nothing; abstention is silent by contract. Copy is education-framed: items to
 * investigate, never verdicts.
 */
export interface RuleResult {
  ruleId: RuleId;
  name: string;
  severity: Severity;
  /** The consecutive FY labels the rule evaluated, ascending. */
  window: FyLabel[];
  /** The numbers the rule fired with, for the UI's "what fired" rendering. */
  firedWith: Record<string, number | string>;
  explanation: string;
  whatToCheck: string;
}

export interface MetricsReport {
  /** Labelled years present in the input, ascending by label. */
  fyLabels: FyLabel[];
  latestFy: FyLabel | null;
  /** Currency of the latest year; null when the input has no years. */
  currency: CurrencyCode | null;
  metrics: Record<MetricId, MetricSeries>;
  flags: RuleResult[];
  /**
   * N3: market cap = price times the latest complete FY's diluted shares,
   * in minor units; null without a price or a complete year.
   */
  marketCapMinor: number | null;
}
