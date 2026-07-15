/**
 * The extraction output contract: what a model must return and what the
 * validation gates, review mode, and the entry grid consume. Values are
 * AS PRINTED in the filing (signed, at the stated scale), never converted;
 * the minor-units conversion is the entry layer's job, exactly as it is for
 * a human typing from the same page. Zod at the boundary, per house rules.
 */
import { LINE_ITEM_IDS } from '@plainsight/calc-engine';
import { z } from 'zod';

const confidence = z.number().min(0).max(1);
const printedPage = z.number().int().positive();

/**
 * One line item as read from the statements. A printed dash is a printed
 * nil: value 0. A line the statements clearly do not carry is notPrinted
 * (landing as the not-reported-zero entry state); an item the model cannot
 * determine is omitted from the map entirely.
 */
const printedFieldSchema = z.object({
  value: z.number().finite(),
  page: printedPage.optional(),
  confidence
});

const notPrintedFieldSchema = z.object({
  notPrinted: z.literal(true),
  confidence
});

export const extractedFieldSchema = z.union([printedFieldSchema, notPrintedFieldSchema]);
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

/**
 * The printed diluted EPS, when the face carries one: not a canonical line
 * item, but with dilutedShares it powers the same print checksum the golden
 * corpus uses to pin netIncome and the share count together.
 */
export const extractedEpsSchema = z.object({
  value: z.number().finite(),
  unit: z.enum(['dollars', 'cents']),
  page: printedPage.optional(),
  confidence
});

export const extractedYearSchema = z.object({
  fy: z.string().regex(/^FY\d{4}$/),
  /** The exact period end printed in the statement heading (52/53-week calendars). */
  endDate: z.iso.date(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** The scale of the printed money columns; dilutedShares is always an exact count. */
  scale: z.enum(['ones', 'thousands', 'millions', 'billions']),
  fields: z.partialRecord(z.enum(LINE_ITEM_IDS), extractedFieldSchema),
  dilutedEps: extractedEpsSchema.optional()
});
export type ExtractedYear = z.infer<typeof extractedYearSchema>;

export const extractionResultSchema = z.object({
  years: z.array(extractedYearSchema).min(1),
  /** Anything the model needs a human to know (restatements, missing sections). */
  warnings: z.array(z.string()).optional()
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** Recorded into provenance on every extraction (backend spec section 6). */
export const extractionProvenanceSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1)
});
export type ExtractionProvenance = z.infer<typeof extractionProvenanceSchema>;
