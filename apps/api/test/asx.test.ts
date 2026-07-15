/**
 * Behavioural tests for the ASX MAP side: the year-page parser and client
 * etiquette over fakes, the pure statutory-report resolution against the
 * corpus's real lodgement vocabulary, and the DOC# cache choreography.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  DocumentCache,
  MapClient,
  announcementsYearUrl,
  displayAnnouncementUrl,
  documentSortKey,
  lodgementYears,
  parseAnnouncementsPage,
  resolveStatutoryReport,
  type MapAnnouncement
} from '../src/index.js';

// ---------------------------------------------------------------------------
// The year-page parser
// ---------------------------------------------------------------------------

/** A structural echo of the announcements.do row markup. */
const row = (
  idsId: string,
  date: string,
  headline: string,
  pages: number,
  size: string,
  sensitive = false
) => `
  <tr class="altrow">
    <td>${date}<br><span class="dates-time">7:40 am</span></td>
    <td class="pricesens">${sensitive ? '<img src="/x.svg" alt="asterix" title="price sensitive">' : ''}</td>
    <td>
      <a style="text-decoration: none;" target="_blank" href="/asx/v2/statistics/displayAnnouncement.do?display=pdf&amp;idsId=${idsId}">
        ${headline}<br>
        <img src="/asx/v2/markets/image/pdf_icon.png" height="16" width="16">
        <span class="page">${pages}\n pages\n</span>
        <span class="filesize">\n ${size}\n</span>
      </a>
    </td>
  </tr>`;

const YEAR_PAGE = `<table>
  ${row('02981729', '19/08/2025', 'CSL Statutory Accounts for FY2025', 151, '15.4MB', true)}
  ${row('02981730', '19/08/2025', 'CSL Results Presentation', 32, '3.0MB')}
  <tr><td>a header row with no announcement link</td></tr>
  ${row('02981731', '18/08/2025', 'Notice of Investor/Analyst Briefing 2025 Full Year Result', 1, '156.0KB')}
</table>`;

describe('parseAnnouncementsPage', () => {
  it('reads idsId, date, headline, pages, size, and the sensitive marker', () => {
    const parsed = parseAnnouncementsPage(YEAR_PAGE);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({
      idsId: '02981729',
      date: '2025-08-19',
      headline: 'CSL Statutory Accounts for FY2025',
      priceSensitive: true,
      pages: 151,
      fileSize: '15.4MB'
    });
    expect(parsed[1]?.priceSensitive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Client etiquette and document fetching
// ---------------------------------------------------------------------------

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe('the MAP client', () => {
  it('declares the contact in its User-Agent and paces successive requests', async () => {
    const calls: { url: string; userAgent: string | null }[] = [];
    const sleeps: number[] = [];
    let clock = 10_000;
    const client = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(input), userAgent: new Headers(init?.headers).get('user-agent') });
        return new Response(YEAR_PAGE);
      }) as unknown as typeof fetch,
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock
    });

    await client.listAnnouncements('csl', 2025);
    await client.listAnnouncements('csl', 2024);

    expect(calls[0]?.url).toBe(announcementsYearUrl('CSL', 2025));
    expect(calls[0]?.userAgent).toBe('Plainsight ingest (owner@example.com)');
    // The second request waited out the pace window; the first went straight through.
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it('retries retryable statuses with backoff and gives up on the budget', async () => {
    const statuses = [503, 429, 200];
    const client = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async () => new Response(YEAR_PAGE, { status: statuses.shift() ?? 200 })) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    await expect(client.listAnnouncements('CSL', 2025)).resolves.toHaveLength(3);

    const alwaysDown = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    await expect(alwaysDown.listAnnouncements('CSL', 2025)).rejects.toThrow('after 3 attempt');

    const forbiddenPage = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async () => new Response('x', { status: 404 })) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    await expect(forbiddenPage.listAnnouncements('CSL', 2025)).rejects.toThrow('after 1 attempt');
  });

  it('fetches a directly served PDF and verifies the magic bytes', async () => {
    const client = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async () => new Response(PDF_BYTES)) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    const bytes = await client.fetchAnnouncementPdf('02981729');
    expect([...bytes.slice(0, 4)]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it('follows the interstitial to the asxpdf link for sensitive documents', async () => {
    const urls: string[] = [];
    const client = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('displayAnnouncement')) {
          return new Response(
            '<html>Agree and proceed <a href="/asxpdf/20250819/pdf/06abc123.pdf">document</a></html>'
          );
        }
        return new Response(PDF_BYTES);
      }) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });

    const bytes = await client.fetchAnnouncementPdf('02981729');
    expect([...bytes.slice(0, 4)]).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(urls[0]).toBe(displayAnnouncementUrl('02981729'));
    expect(urls[1]).toBe('https://announcements.asx.com.au/asxpdf/20250819/pdf/06abc123.pdf');
  });

  it('refuses interstitials without a document and non-PDF payloads', async () => {
    const noLink = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async () => new Response('<html>nothing here</html>')) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    await expect(noLink.fetchAnnouncementPdf('1')).rejects.toThrow('neither a PDF');

    const htmlBehindLink = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: vi.fn(async (input: string | URL | Request) =>
        String(input).includes('displayAnnouncement')
          ? new Response('<a href="https://announcements.asx.com.au/asxpdf/x/y.pdf">d</a>')
          : new Response('<html>error page</html>')
      ) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    await expect(htmlBehindLink.fetchAnnouncementPdf('2')).rejects.toThrow('not a PDF');
  });
});

// ---------------------------------------------------------------------------
// Statutory-report resolution
// ---------------------------------------------------------------------------

const announcement = (
  idsId: string,
  date: string,
  headline: string,
  pages: number
): MapAnnouncement => ({ idsId, date, headline, priceSensitive: false, pages, fileSize: undefined });

describe('resolveStatutoryReport', () => {
  it('picks each corpus company’s real statements lodgement over its noise', () => {
    const csl = resolveStatutoryReport(
      [
        announcement('1', '2025-08-19', 'CSL Statutory Accounts for FY2025', 151),
        announcement('2', '2025-08-19', 'CSL Results Presentation', 32),
        announcement('3', '2025-08-19', 'CSL FY25 Results and Major Strategic Initiatives', 7),
        announcement('4', '2025-08-19', 'Appendix 4G and Corporate Governance Statement', 34)
      ],
      '2025-06-30'
    );
    expect(csl?.idsId).toBe('1');

    // JB Hi-Fi's glossy annual report carries no statements; the 4E does.
    const jbh = resolveStatutoryReport(
      [
        announcement('1', '2025-08-11', 'Appendix 4E and Financial Report 2025 Full Year', 104),
        announcement('2', '2025-09-12', 'Annual Report 2025 with Chairman and CEO Report', 118),
        announcement('3', '2025-08-11', 'FY25 Results Presentation', 40)
      ],
      '2025-06-30'
    );
    expect(jbh?.idsId).toBe('1');

    const wes = resolveStatutoryReport(
      [
        announcement('1', '2025-08-28', '2025 Annual Report including Appendix 4E', 232),
        announcement('2', '2025-08-28', '2025 Full Year Results Briefing Presentation', 60)
      ],
      '2025-06-30'
    );
    expect(wes?.idsId).toBe('1');

    // Woolworths lodges a plain annual report; no statutory tier exists.
    const wow = resolveStatutoryReport(
      [
        announcement('1', '2025-08-27', 'Woolworths Group 2025 Annual Report', 172),
        announcement('2', '2025-08-27', 'Notice of Annual General Meeting', 12),
        announcement('3', '2025-08-27', 'Media Release - Full Year Results', 6)
      ],
      '2025-06-29'
    );
    expect(wow?.idsId).toBe('1');

    // Cochlear lodges a one-page Appendix 4E cover beside the real report:
    // the statutory tier must not let the cover outrank the statements.
    const coh = resolveStatutoryReport(
      [
        announcement('1', '2025-08-15', 'Appendix 4E', 1),
        announcement('2', '2025-08-15', 'Annual Report (incl Sustainability reporting)', 188)
      ],
      '2025-06-30'
    );
    expect(coh?.idsId).toBe('2');
  });

  it('stays inside the lodgement window', () => {
    const stale = resolveStatutoryReport(
      [announcement('1', '2024-08-19', 'Statutory Accounts for FY2024', 150)],
      '2025-06-30'
    );
    expect(stale).toBeUndefined();

    const next = resolveStatutoryReport(
      [announcement('1', '2026-08-19', 'Statutory Accounts for FY2026', 150)],
      '2025-06-30'
    );
    expect(next).toBeUndefined();
  });

  it('returns undefined when only noise exists', () => {
    expect(
      resolveStatutoryReport(
        [announcement('1', '2025-08-19', 'Change of Director’s Interest Notice', 3)],
        '2025-06-30'
      )
    ).toBeUndefined();
  });

  it('prefers the fatter document when the same tier lodges twice', () => {
    const picked = resolveStatutoryReport(
      [
        announcement('1', '2025-08-19', 'Financial Report 2025', 90),
        announcement('2', '2025-08-19', 'Annual Financial Report 2025 (replacement)', 151)
      ],
      '2025-06-30'
    );
    expect(picked?.idsId).toBe('2');
  });
});

describe('lodgementYears', () => {
  it('spills September-or-later balance dates into the next calendar year', () => {
    expect(lodgementYears('2025-06-30')).toEqual([2025]);
    expect(lodgementYears('2025-06-29')).toEqual([2025]);
    expect(lodgementYears('2025-12-31')).toEqual([2025, 2026]);
    expect(lodgementYears('2025-09-30')).toEqual([2025, 2026]);
  });
});

// ---------------------------------------------------------------------------
// The DOC# cache
// ---------------------------------------------------------------------------

const RECORD = {
  ticker: 'CSL',
  documentId: '02981729',
  headline: 'CSL Statutory Accounts for FY2025',
  documentDate: '2025-08-19',
  pdfPages: 151,
  status: 'extracted' as const,
  promptVersion: 'statements-1',
  provider: 'anthropic-haiku-4.5',
  model: 'claude-haiku-4-5-20251001',
  extractedAt: '2026-07-15T03:00:00.000Z',
  result: {
    years: [
      {
        fy: 'FY2025',
        endDate: '2025-06-30',
        currency: 'USD',
        scale: 'millions' as const,
        fields: { revenue: { value: 15558, page: 90, confidence: 1 } }
      }
    ]
  }
};

function fakeDynamo() {
  const items = new Map<string, Record<string, unknown>>();
  return {
    items,
    client: {
      send: vi.fn((command: { input: Record<string, unknown>; constructor: { name: string } }) => {
        const input = command.input as {
          Key?: { PK: string; SK: string };
          Item?: Record<string, unknown> & { PK: string; SK: string };
          ConditionExpression?: string;
        };
        if (command.constructor.name === 'GetCommand') {
          const key = `${input.Key!.PK}|${input.Key!.SK}`;
          return Promise.resolve({ Item: items.get(key) });
        }
        const key = `${input.Item!.PK}|${input.Item!.SK}`;
        if (input.ConditionExpression !== undefined && items.has(key)) {
          return Promise.reject(new Error('ConditionalCheckFailedException'));
        }
        items.set(key, input.Item!);
        return Promise.resolve({});
      })
    }
  };
}

describe('the DOC# cache', () => {
  it('round-trips a record under the ticker partition and DOC sort key', async () => {
    const fake = fakeDynamo();
    const cache = new DocumentCache(fake.client as never, 'plainsight');

    await cache.putDocument(RECORD);
    expect(fake.items.has(`TICKER#CSL|${documentSortKey('02981729')}`)).toBe(true);

    const read = await cache.getDocument('CSL', '02981729');
    expect(read?.status).toBe('extracted');
    expect(read?.result?.years[0]?.fields.revenue).toMatchObject({ value: 15558 });
  });

  it('is write-once by default and overwrites only when asked', async () => {
    const fake = fakeDynamo();
    const cache = new DocumentCache(fake.client as never, 'plainsight');

    await cache.putDocument(RECORD);
    await expect(cache.putDocument(RECORD)).rejects.toThrow('ConditionalCheckFailed');
    await expect(
      cache.putDocument({ ...RECORD, provider: 'anthropic-sonnet-5' }, { overwrite: true })
    ).resolves.toBeUndefined();
    const read = await cache.getDocument('CSL', '02981729');
    expect(read?.provider).toBe('anthropic-sonnet-5');
  });

  it('treats a stored row that fails the schema as absent', async () => {
    const fake = fakeDynamo();
    fake.items.set(`TICKER#CSL|${documentSortKey('X')}`, { PK: 'TICKER#CSL', SK: 'DOC#X', junk: 1 });
    const cache = new DocumentCache(fake.client as never, 'plainsight');
    await expect(cache.getDocument('CSL', 'X')).resolves.toBeUndefined();
  });

  it('misses cleanly', async () => {
    const cache = new DocumentCache(fakeDynamo().client as never, 'plainsight');
    await expect(cache.getDocument('CSL', 'nope')).resolves.toBeUndefined();
  });
});
