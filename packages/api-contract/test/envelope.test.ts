import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  errorEnvelope,
  errorEnvelopeSchema,
  HTTP_STATUS_BY_CODE,
  ingestingBody,
  ingestingBodySchema
} from '../src/index.js';

describe('error envelope (backend spec section 2)', () => {
  it("parses the spec's own quota example", () => {
    const body = {
      error: {
        code: 'resource_exhausted',
        message: 'Monthly extraction quota reached.',
        details: [{ reason: 'quota', limit: 10, resetsAt: '2026-08-01' }],
        requestId: 'req_2f9c'
      }
    };
    const parsed = errorEnvelopeSchema.parse(body);
    expect(parsed.error.code).toBe('resource_exhausted');
    expect(parsed.error.details[0]).toMatchObject({ reason: 'quota', limit: 10 });
  });

  it('pins the code-to-status mapping exactly', () => {
    expect(HTTP_STATUS_BY_CODE).toEqual({
      invalid_request: 400,
      unauthenticated: 401,
      permission_denied: 403,
      not_found: 404,
      resource_exhausted: 429,
      feature_disabled: 503,
      ingesting: 202,
      internal: 500
    });
    // Every pinned code has a status; a new code without one cannot compile,
    // but a removed code silently would, so the vocabulary is asserted too.
    expect(Object.keys(HTTP_STATUS_BY_CODE).sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it('rejects codes outside the pinned vocabulary', () => {
    const result = errorEnvelopeSchema.safeParse(
      errorEnvelope('internal', 'boom', 'req_1') satisfies object // baseline is valid...
    );
    expect(result.success).toBe(true);
    const unknownCode = { error: { code: 'teapot', message: 'x', details: [], requestId: 'r' } };
    expect(errorEnvelopeSchema.safeParse(unknownCode).success).toBe(false);
  });

  it('requires all four envelope fields, details included', () => {
    const noRequestId = { error: { code: 'internal', message: 'x', details: [] } };
    expect(errorEnvelopeSchema.safeParse(noRequestId).success).toBe(false);
    const noDetails = { error: { code: 'internal', message: 'x', requestId: 'r' } };
    expect(errorEnvelopeSchema.safeParse(noDetails).success).toBe(false);
    const emptyMessage = { error: { code: 'internal', message: '', details: [], requestId: 'r' } };
    expect(errorEnvelopeSchema.safeParse(emptyMessage).success).toBe(false);
  });

  it('requires a reason on every detail entry and tolerates extra fields', () => {
    const noReason = {
      error: { code: 'invalid_request', message: 'x', details: [{ limit: 10 }], requestId: 'r' }
    };
    expect(errorEnvelopeSchema.safeParse(noReason).success).toBe(false);
    const extraFields = errorEnvelope('invalid_request', 'x', 'r', [
      { reason: 'zod', fieldPath: 'values.revenue' }
    ]);
    expect(errorEnvelopeSchema.parse(extraFields).error.details[0]).toMatchObject({
      fieldPath: 'values.revenue'
    });
  });

  it('builds envelopes the schema accepts, with details defaulting to empty', () => {
    const bare = errorEnvelope('not_found', 'Unknown ticker.', 'req_9');
    expect(errorEnvelopeSchema.parse(bare).error.details).toEqual([]);
  });
});

describe('the 202 ingesting body (backend spec sections 2 and 5)', () => {
  it('builds a body that satisfies both the ingesting shape and the general envelope', () => {
    const body = ingestingBody(5, 'req_cold');
    expect(ingestingBodySchema.parse(body).error.details[0].retryAfterSeconds).toBe(5);
    expect(errorEnvelopeSchema.safeParse(body).success).toBe(true);
  });

  it('requires a positive integer retryAfterSeconds', () => {
    expect(ingestingBodySchema.safeParse(ingestingBody(0, 'r')).success).toBe(false);
    expect(ingestingBodySchema.safeParse(ingestingBody(2.5, 'r')).success).toBe(false);
  });

  it('requires exactly one detail entry with the ingesting reason', () => {
    const valid = ingestingBody(5, 'r');
    const twoDetails = {
      error: { ...valid.error, details: [...valid.error.details, { reason: 'ingesting' }] }
    };
    expect(ingestingBodySchema.safeParse(twoDetails).success).toBe(false);
    const wrongReason = {
      error: { ...valid.error, details: [{ reason: 'quota', retryAfterSeconds: 5 }] }
    };
    expect(ingestingBodySchema.safeParse(wrongReason).success).toBe(false);
    const wrongCode = { error: { ...valid.error, code: 'not_found' } };
    expect(ingestingBodySchema.safeParse(wrongCode).success).toBe(false);
  });
});
