/**
 * The error envelope, frozen as part of the API contract (backend spec
 * section 2, owner-confirmed 2026-07-12): every non-2xx response body, and the
 * 202 cold-ticker response, carry exactly this shape. Additive changes never
 * bump the version; changing a pinned field means changing the spec first.
 */
import { z } from 'zod';

const nonEmpty = z.string().min(1);

/**
 * The pinned code vocabulary. `ingesting` rides the same envelope despite the
 * 2xx status: a cold ticker is a known client state (the retry path), not a
 * failure, but the body shape stays uniform so clients parse one thing.
 */
export const API_ERROR_CODES = [
  'invalid_request',
  'unauthenticated',
  'permission_denied',
  'not_found',
  'resource_exhausted',
  'feature_disabled',
  'ingesting',
  'internal'
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** The pinned code-to-status mapping (backend spec section 2). */
export const HTTP_STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  invalid_request: 400,
  unauthenticated: 401,
  permission_denied: 403,
  not_found: 404,
  resource_exhausted: 429,
  feature_disabled: 503,
  ingesting: 202,
  internal: 500
};

/**
 * Every detail entry carries a machine-readable `reason` and may carry free
 * extra fields (the spec's examples: a quota detail with `limit` and
 * `resetsAt`; the ingesting detail below). Loose by design: new detail fields
 * are additive, and clients must tolerate ones they do not know.
 */
export const errorDetailSchema = z.looseObject({ reason: nonEmpty });

export type ApiErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: nonEmpty,
    details: z.array(errorDetailSchema),
    requestId: nonEmpty
  })
});

export type ApiErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Envelope builder for the Lambda side; the tests hold it to the schema. */
export function errorEnvelope(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details: ApiErrorDetail[] = []
): ApiErrorEnvelope {
  return { error: { code, message, details, requestId } };
}

/**
 * The cold-ticker response (backend spec sections 2 and 5): HTTP 202, code
 * `ingesting`, and exactly one detail carrying `retryAfterSeconds`. The pinned
 * envelope has no field for it, so the detail entry is where it rides.
 */
export const ingestingDetailSchema = z.looseObject({
  reason: z.literal('ingesting'),
  retryAfterSeconds: z.number().int().positive()
});

export const ingestingBodySchema = z.object({
  error: z.object({
    code: z.literal('ingesting'),
    message: nonEmpty,
    details: z.tuple([ingestingDetailSchema]),
    requestId: nonEmpty
  })
});

export type IngestingBody = z.infer<typeof ingestingBodySchema>;

export function ingestingBody(retryAfterSeconds: number, requestId: string): IngestingBody {
  return {
    error: {
      code: 'ingesting',
      message: 'First request for this ticker; its filings are being ingested. Retry shortly.',
      details: [{ reason: 'ingesting', retryAfterSeconds }],
      requestId
    }
  };
}
