/**
 * The pairs sleeve's artefact contract (integration plan §4): the read
 * side of the schemas the engine writes with pydantic. The two are
 * mirrored against one committed golden fixture: the engine's suite pins
 * its serialisation to the fixture's bytes, and this package parses the
 * same bytes, so schema drift on either side fails a test, never a
 * render. Regeneration lives with the engine (pairs_engine.golden).
 */
import { z } from 'zod';

const nonEmpty = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

export const PAIR_SCAN_ARTEFACT_KIND = 'pairScanReport';
export const PAIR_SCAN_SCHEMA_VERSION = 1;

/** The engine's skip reasons; a new reason is a schema change on both sides. */
export const PAIR_SKIP_REASONS = ['insufficientSharedHistory', 'cointegrationTestFailed'] as const;

export const pairScanWindowSchema = z.object({
  start: isoDate,
  end: isoDate,
  splitDate: isoDate,
  trainFraction: z.number().positive(),
  minSharedTrainDays: z.number().int().positive()
});

export const pairScanCriteriaSchema = z.object({
  maxPValue: z.number().positive(),
  maxCandidateHalfLifeDays: z.number().positive(),
  halfLifeCeilingDays: z.number().positive(),
  minAbsRegressionR: z.number().positive(),
  requirePositiveBeta: z.boolean()
});

export const pairRowSchema = z.object({
  ticker1: nonEmpty,
  ticker2: nonEmpty,
  sharedTrainDays: z.number().int().nonnegative(),
  pValue: z.number(),
  beta: z.number(),
  intercept: z.number(),
  correlation: z.number(),
  halfLifeDays: z.number().nullable(),
  halfLifeValid: z.boolean(),
  candidate: z.boolean()
});

export const skippedPairSchema = z.object({
  ticker1: nonEmpty,
  ticker2: nonEmpty,
  sharedTrainDays: z.number().int().nonnegative(),
  reason: z.enum(PAIR_SKIP_REASONS)
});

export const pairCandidateSchema = z.object({
  ticker1: nonEmpty,
  ticker2: nonEmpty,
  beta: z.number(),
  pValue: z.number(),
  halfLifeDays: z.number(),
  correlation: z.number()
});

export const pairScanReportSchema = z.object({
  artefact: z.literal(PAIR_SCAN_ARTEFACT_KIND),
  schemaVersion: z.literal(PAIR_SCAN_SCHEMA_VERSION),
  engineVersion: nonEmpty,
  runDate: isoDate,
  generatedAt: isoDateTime,
  universe: z.array(nonEmpty),
  window: pairScanWindowSchema,
  criteria: pairScanCriteriaSchema,
  pairsTested: z.number().int().nonnegative(),
  pairs: z.array(pairRowSchema),
  skipped: z.array(skippedPairSchema),
  candidates: z.array(pairCandidateSchema)
});

/** One stored run: the PUT response and the history rows of the GET. */
export const pairsArtefactRunSchema = z.object({
  runDate: isoDate,
  engineVersion: nonEmpty,
  schemaVersion: z.number().int().positive(),
  generatedAt: isoDateTime,
  receivedAt: isoDateTime,
  sizeBytes: z.number().int().nonnegative()
});

/** The GET response: the latest report in full plus the run history. */
export const pairsArtefactCollectionSchema = z.object({
  latest: pairScanReportSchema.nullable(),
  history: z.array(pairsArtefactRunSchema)
});

export type PairScanReport = z.infer<typeof pairScanReportSchema>;
export type PairRow = z.infer<typeof pairRowSchema>;
export type PairsArtefactRun = z.infer<typeof pairsArtefactRunSchema>;
export type PairsArtefactCollection = z.infer<typeof pairsArtefactCollectionSchema>;
