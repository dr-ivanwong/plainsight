/**
 * The HTTP seam every handler shares: JSON responses and the request id that
 * the error envelope carries end to end (backend spec §2; the envelope's
 * requestId is the debugging handle, propagated edge to Lambda to log line).
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export function jsonResponse(
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}

export const requestIdOf = (event: APIGatewayProxyEventV2): string =>
  event.requestContext.requestId;

/**
 * Structured log line (backend spec §11): requestId, route, outcome, never
 * payloads, tokens, or headers.
 */
export function logOutcome(entry: {
  requestId: string;
  route: string;
  outcome: string;
  detail?: string;
}): void {
  console.log(JSON.stringify(entry));
}
