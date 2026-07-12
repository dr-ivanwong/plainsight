/**
 * The EDGAR companyfacts boundary: the subset of the document the mapping
 * consumes, validated where it is consumed. A companyfacts payload runs to
 * megabytes and thousands of concepts; validating the whole document buys
 * nothing, so the top-level shape is checked once and each candidate concept
 * is checked when the mapping first reads it. Anything the mapping never
 * touches is never trusted either.
 */
import { z } from 'zod';

const isoDate = z.iso.date();
const nonEmpty = z.string().min(1);

/**
 * One reported fact, reduced to the fields the selection policy uses. Loose:
 * EDGAR carries more (fy, fp, frame), and additive fields must never break
 * ingestion.
 */
export const factSchema = z.looseObject({
  start: isoDate.optional(),
  end: isoDate,
  val: z.number(),
  accn: nonEmpty,
  form: nonEmpty,
  filed: isoDate
});

export type EdgarFact = z.infer<typeof factSchema>;

/** One concept's facts, keyed by unit of measure ('USD', 'shares', ...). */
export const conceptSchema = z.looseObject({
  units: z.record(z.string(), z.array(factSchema))
});

export type EdgarConcept = z.infer<typeof conceptSchema>;

export const companyfactsSchema = z.looseObject({
  cik: z.number().int().positive(),
  entityName: z.string(),
  facts: z.looseObject({
    'us-gaap': z.record(z.string(), z.unknown()).optional()
  })
});

export type Companyfacts = z.infer<typeof companyfactsSchema>;
