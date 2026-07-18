/**
 * POST /v1/uploads (backend spec §6): a presigned PUT for one filing, keyed
 * under the caller's own prefix, expiring in fifteen minutes, with the
 * content type and byte length signed into it so the URL can carry nothing
 * else. The bucket's seven-day lifecycle makes an abandoned upload cost
 * nothing.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { errorEnvelope, uploadRequestSchema, uploadResponseSchema } from '@plainsight/api-contract';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { userIdOf } from './syncPush.js';

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface PresignInput {
  objectKey: string;
  contentType: string;
  contentLength: number;
}

export type Presigner = (input: PresignInput) => Promise<string>;

/** Path separators and control characters have no business in an object key. */
export const safeFileName = (fileName: string): string => {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '');
  return cleaned.length > 0 ? cleaned.slice(-120) : 'document.pdf';
};

export function createUploadHandler(
  presign: Presigner,
  now: () => Date = () => new Date(),
  newId: () => string = randomUUID
) {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const userId = userIdOf(event);
      if (userId === undefined) {
        return jsonResponse(
          401,
          errorEnvelope('unauthenticated', 'A signed-in session is required to upload.', requestId)
        );
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(event.body ?? '');
      } catch {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'The upload request must be JSON.', requestId)
        );
      }
      const request = uploadRequestSchema.safeParse(parsedBody);
      if (!request.success) {
        return jsonResponse(
          400,
          errorEnvelope(
            'invalid_request',
            'An upload needs a file name, a supported content type, and a size inside 50 MB.',
            requestId
          )
        );
      }

      const objectKey = `uploads/${userId}/${newId()}/${safeFileName(request.data.fileName)}`;
      const url = await presign({
        objectKey,
        contentType: request.data.contentType,
        contentLength: request.data.sizeBytes
      });
      const body = uploadResponseSchema.parse({
        objectKey,
        url,
        headers: { 'content-type': request.data.contentType },
        expiresAt: new Date(now().getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString()
      });
      logOutcome({ requestId, route: 'createUpload', outcome: 'signed' });
      return jsonResponse(200, body);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'createUpload',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong preparing this upload.', requestId)
      );
    }
  };
}

let presigner: Presigner | undefined;

function buildPresigner(): Presigner {
  const bucket = process.env['UPLOADS_BUCKET'];
  if (!bucket) throw new Error('UPLOADS_BUCKET is not set');
  const s3 = new S3Client({});
  return (input) =>
    getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        ContentLength: input.contentLength
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS }
    );
}

/** Lambda entry point. */
export const handler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyStructuredResultV2> => {
  presigner ??= buildPresigner();
  return createUploadHandler(presigner)(event);
};
