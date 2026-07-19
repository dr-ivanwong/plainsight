/**
 * The upload and extraction-job wire contract (backend spec section 6): a
 * presigned PUT to hand a filing over, a job that walks the honest stage
 * labels the review screen mirrors, and a terminal state that is either a
 * reviewable result or a plainly named failure. The server never writes an
 * upload's figures anywhere canonical; the reviewed data lands in the
 * client's own library.
 */
import {
  extractionProvenanceSchema,
  extractionResultSchema
} from '@plainsight/extraction-core';
import { z } from 'zod';

const nonEmpty = z.string().min(1);

export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/**
 * PDF only for now: the spec names PDF, XLSX, and CSV, but the spreadsheet
 * arm needs the sheet parser wired on both sides and neither side carries it
 * yet; the enum widens additively when it lands.
 */
export const UPLOAD_CONTENT_TYPES = ['application/pdf'] as const;

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES)
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const uploadResponseSchema = z.object({
  objectKey: nonEmpty,
  /** The presigned PUT; it expires in fifteen minutes. */
  url: nonEmpty,
  headers: z.record(z.string(), z.string()),
  expiresAt: nonEmpty
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

/** The job states, mirrored verbatim by the review screen's stage labels. */
export const EXTRACTION_JOB_STATES = [
  'queued',
  'preprocessing',
  'extracting',
  'validating',
  'review_required',
  'failed'
] as const;

export type ExtractionJobState = (typeof EXTRACTION_JOB_STATES)[number];

export const createExtractionRequestSchema = z.object({
  objectKey: z.string().min(1).max(512),
  confidential: z.boolean().optional()
});

export type CreateExtractionRequest = z.infer<typeof createExtractionRequestSchema>;

/** One ladder attempt, appended to the job for provenance (spec section 6). */
export const extractionAttemptSchema = z.object({
  provider: nonEmpty,
  model: nonEmpty,
  promptVersion: nonEmpty,
  outcome: nonEmpty
});

export type ExtractionAttempt = z.infer<typeof extractionAttemptSchema>;

/**
 * One year the validating stage's gates flagged (the backend spec section 5
 * gates, run over uploads by the section 6 worker). Uploads have no
 * quarantine because nothing is served unreviewed; the verdicts travel to
 * the reviewer instead, naming the year and every reason.
 */
export const extractionGateFindingSchema = z.object({
  fy: nonEmpty,
  reasons: z.array(nonEmpty).min(1)
});

export type ExtractionGateFinding = z.infer<typeof extractionGateFindingSchema>;

export const extractionJobSchema = z
  .object({
    jobId: nonEmpty,
    state: z.enum(EXTRACTION_JOB_STATES),
    createdAt: nonEmpty,
    confidential: z.boolean(),
    attempts: z.array(extractionAttemptSchema),
    /** The rung currently running, while extracting. */
    rung: z.string().optional(),
    /** The success: statements with per-field confidence, for the reviewer. */
    review: z
      .object({
        result: extractionResultSchema,
        provenance: extractionProvenanceSchema,
        /** Present only when the gates flagged years; absent means all clear. */
        gateFindings: z.array(extractionGateFindingSchema).min(1).optional()
      })
      .optional(),
    /** The failure, plainly named, with the next rung where one exists. */
    failure: z
      .object({
        detail: nonEmpty,
        nextRung: z.string().nullable()
      })
      .optional()
  })
  .refine((job) => (job.state === 'review_required') === (job.review !== undefined), {
    message: 'review_required carries the review payload; no other state does'
  })
  .refine((job) => (job.state === 'failed') === (job.failure !== undefined), {
    message: 'failed carries the failure block; no other state does'
  });

export type ExtractionJob = z.infer<typeof extractionJobSchema>;
