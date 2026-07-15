import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ProviderCallError,
  REGISTRY,
  providerFor,
  type ExtractionRequest,
  type FetchLike,
  type PreparedDocument,
  type RegistryEntry
} from '../src/index.js';

const byId = (id: string): RegistryEntry => {
  const entry = REGISTRY.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no registry entry ${id}`);
  return entry;
};

const textDocument: PreparedDocument = {
  sections: [
    { page: 128, text: 'Revenue 2,343.1' },
    { text: 'Notes without a page marker' }
  ]
};

const visionDocument: PreparedDocument = {
  sections: [{ page: 128, text: 'Revenue 2,343.1', imagePngBase64: 'UE5H' }]
};

const request = (document: PreparedDocument, repair?: ExtractionRequest['repair']) =>
  repair === undefined
    ? { document, prompt: 'PROMPT' }
    : { document, prompt: 'PROMPT', repair };

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A fetch stub that captures the request and returns the given payload. */
function stubFetch(payload: unknown, status = 200): { fetch: FetchLike; captured: Captured } {
  const captured: Captured = { url: '', headers: {}, body: {} };
  const fetch: FetchLike = (input, init) => {
    captured.url = input;
    captured.headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>)
    );
    captured.body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' }
      })
    );
  };
  return { fetch, captured };
}

describe('the Anthropic adapter', () => {
  const entry = byId('anthropic-haiku-4.5');

  it('shapes the wire call: endpoint, key header, browser opt-in, interleaved parts', async () => {
    const { fetch, captured } = stubFetch({
      content: [{ type: 'text', text: '{"years"' }, { type: 'text', text: ': []}' }]
    });
    const raw = await providerFor(entry, { fetchImpl: fetch }).extract(
      request(visionDocument),
      'test-key'
    );

    expect(raw).toBe('{"years": []}');
    expect(captured.url).toBe('https://api.anthropic.com/v1/messages');
    expect(captured.headers['x-api-key']).toBe('test-key');
    expect(captured.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(captured.body.model).toBe(entry.model);
    const [message] = captured.body.messages as [{ content: unknown[] }];
    expect(message.content).toEqual([
      { type: 'text', text: 'PROMPT' },
      { type: 'text', text: '[printed page 128]\nRevenue 2,343.1' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'UE5H' } }
    ]);
  });

  it('appends the repair turns as a continued conversation', async () => {
    const { fetch, captured } = stubFetch({ content: [{ type: 'text', text: 'ok' }] });
    await providerFor(entry, { fetchImpl: fetch }).extract(
      request(textDocument, { previousResponse: 'garbage', followUp: 'fix it' }),
      'k'
    );
    const messages = captured.body.messages as { role: string; content: unknown }[];
    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ role: 'assistant', content: 'garbage' });
    expect(messages[2]).toEqual({ role: 'user', content: 'fix it' });
  });

  it('classifies empty and misshapen responses as bad_response', async () => {
    const provider = providerFor(entry, { fetchImpl: stubFetch({ content: [] }).fetch });
    await expect(provider.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'bad_response'
    });
    const misshapen = providerFor(entry, { fetchImpl: stubFetch({ nope: true }).fetch });
    await expect(misshapen.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'bad_response'
    });
  });
});

describe('the Gemini adapter', () => {
  const entry = byId('gemini-2.5-flash');

  it('keeps the key in a header, never the URL, and reads the first candidate', async () => {
    const { fetch, captured } = stubFetch({
      candidates: [{ content: { parts: [{ text: '{"years": []}' }] } }]
    });
    const raw = await providerFor(entry, { fetchImpl: fetch }).extract(
      request(visionDocument, { previousResponse: 'p', followUp: 'f' }),
      'gem-key'
    );

    expect(raw).toBe('{"years": []}');
    expect(captured.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
    expect(captured.url).not.toContain('gem-key');
    expect(captured.headers['x-goog-api-key']).toBe('gem-key');
    const contents = captured.body.contents as { role: string; parts: unknown[] }[];
    expect(contents).toHaveLength(3);
    expect(contents[0]?.parts).toEqual([
      { text: 'PROMPT' },
      { text: '[printed page 128]\nRevenue 2,343.1' },
      { inline_data: { mime_type: 'image/png', data: 'UE5H' } }
    ]);
    expect(contents[1]).toEqual({ role: 'model', parts: [{ text: 'p' }] });
  });

  it('treats no candidates and misshapen bodies as bad_response', async () => {
    for (const payload of [{ candidates: [] }, {}, { candidates: 'x' }]) {
      const provider = providerFor(entry, { fetchImpl: stubFetch(payload).fetch });
      await expect(provider.extract(request(textDocument), 'k')).rejects.toMatchObject({
        kind: 'bad_response'
      });
    }
  });

  it('skips non-text parts in the reply, as thinking-enabled responses interleave', async () => {
    const provider = providerFor(entry, {
      fetchImpl: stubFetch({
        candidates: [{ content: { parts: [{}, { text: 'ok' }] } }]
      }).fetch
    });
    await expect(provider.extract(request(textDocument), 'k')).resolves.toBe('ok');
  });
});

describe('the OpenAI-compatible adapter', () => {
  const entry = byId('groq-llama-3.3-70b');

  it('bearer-authorises against chat/completions with one flattened message', async () => {
    const { fetch, captured } = stubFetch({
      choices: [{ message: { content: '{"years": []}' } }]
    });
    const raw = await providerFor(entry, { fetchImpl: fetch }).extract(
      request(textDocument, { previousResponse: 'p', followUp: 'f' }),
      'groq-key'
    );

    expect(raw).toBe('{"years": []}');
    expect(captured.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(captured.headers.authorization).toBe('Bearer groq-key');
    const messages = captured.body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(3);
    expect(messages[0]?.content).toBe(
      'PROMPT\n\n[printed page 128]\nRevenue 2,343.1\n\nNotes without a page marker'
    );
  });

  it('refuses image-only sections loudly (a routing bug, not a silent half-read)', async () => {
    const provider = providerFor(entry, { fetchImpl: stubFetch({}).fetch });
    await expect(
      provider.extract(request({ sections: [{ imagePngBase64: 'UE5H' }] }), 'k')
    ).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('treats null content and misshapen bodies as bad_response', async () => {
    const nullContent = providerFor(entry, {
      fetchImpl: stubFetch({ choices: [{ message: { content: null } }] }).fetch
    });
    await expect(nullContent.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'bad_response'
    });
    const misshapen = providerFor(entry, { fetchImpl: stubFetch({ choices: {} }).fetch });
    await expect(misshapen.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'bad_response'
    });
  });
});

describe('HTTP failure classification', () => {
  const entry = byId('deepseek-chat');

  it.each([
    [429, 'rate_limited'],
    [401, 'auth'],
    [403, 'auth'],
    [400, 'bad_request'],
    [503, 'server']
  ])('HTTP %d classifies as %s', async (status, kind) => {
    const provider = providerFor(entry, {
      fetchImpl: stubFetch({ error: 'x' }, status as number).fetch
    });
    await expect(provider.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind,
      status
    });
  });

  it('classifies timeouts and network failures distinctly', async () => {
    const timeout = providerFor(entry, {
      fetchImpl: () => Promise.reject(new DOMException('t', 'TimeoutError')),
      timeoutMs: 5
    });
    await expect(timeout.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'timeout'
    });

    const network = providerFor(entry, {
      fetchImpl: () => Promise.reject(new TypeError('fetch failed'))
    });
    await expect(network.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'network'
    });
  });

  it('classifies a non-JSON success body as bad_response', async () => {
    const provider = providerFor(entry, {
      fetchImpl: () => Promise.resolve(new Response('<html>', { status: 200 }))
    });
    await expect(provider.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'bad_response'
    });
  });

  it('ProviderCallError carries kind and status for the attempt log', () => {
    const error = new ProviderCallError('server', 'HTTP 500', 500);
    expect(error.name).toBe('ProviderCallError');
    expect(error.kind).toBe('server');
    expect(error.status).toBe(500);
  });

  it('a non-Error rejection still classifies as network', async () => {
    const provider = providerFor(entry, {
      // eslint-disable-next-line prefer-promise-reject-errors
      fetchImpl: () => Promise.reject('unplugged')
    });
    await expect(provider.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'network'
    });
  });

  it('error bodies are optional: empty and unreadable bodies still classify', async () => {
    const emptyBody = providerFor(entry, {
      fetchImpl: () => Promise.resolve(new Response('', { status: 500 }))
    });
    await expect(emptyBody.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'server',
      message: 'HTTP 500'
    });

    const unreadable = new Response('x', { status: 502 });
    Object.defineProperty(unreadable, 'text', {
      value: () => Promise.reject(new Error('stream gone'))
    });
    const unreadableBody = providerFor(entry, {
      fetchImpl: () => Promise.resolve(unreadable)
    });
    await expect(unreadableBody.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'server',
      message: 'HTTP 502'
    });
  });
});

describe('vision sections without a text layer', () => {
  const imageOnly: PreparedDocument = { sections: [{ imagePngBase64: 'UE5H' }] };

  it('travel as image parts alone on the vision adapters', async () => {
    const anthropic = stubFetch({ content: [{ type: 'text', text: 'ok' }] });
    await providerFor(byId('anthropic-haiku-4.5'), { fetchImpl: anthropic.fetch }).extract(
      request(imageOnly),
      'k'
    );
    const [anthropicMessage] = anthropic.captured.body.messages as [{ content: unknown[] }];
    expect(anthropicMessage.content).toEqual([
      { type: 'text', text: 'PROMPT' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'UE5H' } }
    ]);

    const gemini = stubFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await providerFor(byId('gemini-2.5-flash'), { fetchImpl: gemini.fetch }).extract(
      request(imageOnly),
      'k'
    );
    const contents = gemini.captured.body.contents as { parts: unknown[] }[];
    expect(contents[0]?.parts).toEqual([
      { text: 'PROMPT' },
      { inline_data: { mime_type: 'image/png', data: 'UE5H' } }
    ]);
  });

  it('a Gemini candidate without content reads as empty, so bad_response', async () => {
    const provider = providerFor(byId('gemini-2.5-flash'), {
      fetchImpl: stubFetch({ candidates: [{}] }).fetch
    });
    await expect(provider.extract(request(textDocument), 'k')).rejects.toMatchObject({
      kind: 'bad_response'
    });
  });
});

describe('the default fetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is the global one, so browser and Lambda need no wiring', async () => {
    const { fetch } = stubFetch({ choices: [{ message: { content: 'ok' } }] });
    vi.stubGlobal('fetch', fetch);
    const raw = await providerFor(byId('groq-llama-3.3-70b')).extract(
      request(textDocument),
      'k'
    );
    expect(raw).toBe('ok');
  });
});
