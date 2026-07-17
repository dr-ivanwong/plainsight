/**
 * Typed search-param contracts (frontend spec §1.1). Sheets and modals encode
 * their state in query params, validated here so `?metric=roe` is a contract
 * the compiler checks rather than a string the runtime parses. Unrecognised
 * values drop to undefined instead of throwing: a stale bookmark or a mangled
 * link degrades to the plain screen, never to an error boundary.
 */
import {
  isFyLabel,
  LINE_ITEM_IDS,
  METRIC_IDS,
  STATEMENT_KINDS,
  type FyLabel,
  type MetricId,
  type StatementKind
} from '@plainsight/calc-engine';
import { z } from 'zod';

// Built from the engine's own constants and guards, never from the storage
// layer: route definitions load with the shell, and dragging Dexie into that
// chunk would weigh the first paint down for nothing.
const metricParam = z.enum(METRIC_IDS as readonly [MetricId, ...MetricId[]]);
const statementParam = z.enum(STATEMENT_KINDS as readonly [StatementKind, ...StatementKind[]]);
const lineItemParam = z.enum(LINE_ITEM_IDS);
const fyParam = z.custom<FyLabel>((value) => typeof value === 'string' && isFyLabel(value));

/** The dashboard's detail-sheet state: `?metric=roe` opens that metric's sheet. */
export const dashboardSearchSchema = z.object({
  metric: metricParam.optional().catch(undefined)
});

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

/**
 * The entry screen's deep-link params, pinned by data-model spec §10:
 * `?stmt=<statement>&fy=<label>&focus=<lineItemId>` lands on the first
 * missing item behind an insufficient-data card.
 */
export const entrySearchSchema = z.object({
  stmt: statementParam.optional().catch(undefined),
  fy: fyParam.optional().catch(undefined),
  focus: lineItemParam.optional().catch(undefined)
});

export type EntrySearch = z.infer<typeof entrySearchSchema>;

/**
 * The compare screen's selection: `?ids=a,b,c`, comma-separated company ids
 * (frontend spec §1.1), plus the trend chart's `?metric=`. The shape is all
 * the schema can know; which ids exist is the library's business, so unknown
 * ones drop at render time and a stale bookmark degrades to the picker
 * instead of an error. A metric the trend cannot show (hidden money row in a
 * mixed-currency comparison) degrades to the default at render time the same
 * way.
 */
export const compareSearchSchema = z.object({
  ids: z.string().optional().catch(undefined),
  metric: metricParam.optional().catch(undefined)
});

export type CompareSearch = z.infer<typeof compareSearchSchema>;
