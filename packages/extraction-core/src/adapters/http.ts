/**
 * The one HTTP call every adapter makes, with failures classified the way
 * the ladder walk needs them (escalate versus surface). Isomorphic: fetch is
 * injected so the browser, Lambda, and the tests share one code path, and
 * credentials travel only in headers, never in URLs.
 */

export type ProviderFailureKind =
  | 'rate_limited'
  | 'auth'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'bad_response';

export class ProviderCallError extends Error {
  readonly kind: ProviderFailureKind;
  readonly status: number | undefined;

  constructor(kind: ProviderFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'ProviderCallError';
    this.kind = kind;
    this.status = status;
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface PostJsonOptions {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly timeoutMs: number;
  readonly fetchImpl: FetchLike;
}

function classifyStatus(status: number): ProviderFailureKind {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'bad_request';
}

/** POST JSON, classify every way it can fail, return the parsed JSON body. */
export async function postJson(options: PostJsonOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await options.fetchImpl(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs)
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ProviderCallError('timeout', `no response within ${options.timeoutMs}ms`);
    }
    throw new ProviderCallError('network', String(error));
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new ProviderCallError(
      classifyStatus(response.status),
      `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      response.status
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderCallError('bad_response', 'the provider returned non-JSON');
  }
}
