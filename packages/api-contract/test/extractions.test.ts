import { describe, expect, it } from 'vitest';
import {
  createExtractionRequestSchema,
  extractionJobSchema,
  UPLOAD_MAX_BYTES,
  uploadRequestSchema,
  uploadResponseSchema
} from '../src/index.js';

const review = {
  result: {
    years: [
      {
        fy: 'FY2025',
        endDate: '2025-06-30',
        currency: 'AUD',
        scale: 'millions',
        fields: { revenue: { value: 100, confidence: 0.95, page: 3 } }
      }
    ]
  },
  provenance: {
    provider: 'anthropic-haiku-4.5',
    model: 'claude-haiku-4-5-20251001',
    promptVersion: 'v1'
  }
};

const baseJob = {
  jobId: 'job-1',
  state: 'queued',
  createdAt: '2026-07-18T08:00:00Z',
  confidential: false,
  attempts: []
};

describe('upload contract (backend spec section 6)', () => {
  it('accepts a PDF inside the size ceiling and refuses outside it', () => {
    const request = { fileName: 'annual-report.pdf', contentType: 'application/pdf', sizeBytes: 1024 };
    expect(uploadRequestSchema.parse(request).sizeBytes).toBe(1024);
    expect(
      uploadRequestSchema.safeParse({ ...request, sizeBytes: UPLOAD_MAX_BYTES + 1 }).success
    ).toBe(false);
    expect(uploadRequestSchema.safeParse({ ...request, contentType: 'text/html' }).success).toBe(
      false
    );
  });

  it('shapes the presigned answer', () => {
    const body = {
      objectKey: 'uploads/user-1/abc/annual-report.pdf',
      url: 'https://bucket.example/presigned',
      headers: { 'content-type': 'application/pdf' },
      expiresAt: '2026-07-18T08:15:00Z'
    };
    expect(uploadResponseSchema.parse(body).objectKey).toContain('uploads/');
  });
});

describe('extraction job contract (backend spec section 6)', () => {
  it('bounds the start request', () => {
    expect(
      createExtractionRequestSchema.parse({ objectKey: 'uploads/user-1/abc/report.pdf' })
        .confidential
    ).toBeUndefined();
    expect(createExtractionRequestSchema.safeParse({ objectKey: '' }).success).toBe(false);
  });

  it('holds the review payload to the review_required state, both ways', () => {
    expect(extractionJobSchema.parse(baseJob).state).toBe('queued');
    expect(
      extractionJobSchema.parse({ ...baseJob, state: 'review_required', review }).review
    ).toBeDefined();
    expect(extractionJobSchema.safeParse({ ...baseJob, review }).success).toBe(false);
    expect(extractionJobSchema.safeParse({ ...baseJob, state: 'review_required' }).success).toBe(
      false
    );
  });

  it('holds the failure block to the failed state, both ways', () => {
    const failure = { detail: 'every ladder rung failed', nextRung: null };
    expect(extractionJobSchema.parse({ ...baseJob, state: 'failed', failure }).failure).toEqual(
      failure
    );
    expect(extractionJobSchema.safeParse({ ...baseJob, failure }).success).toBe(false);
    expect(extractionJobSchema.safeParse({ ...baseJob, state: 'failed' }).success).toBe(false);
  });
});
