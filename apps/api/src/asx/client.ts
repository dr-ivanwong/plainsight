/**
 * The ASX MAP client, etiquette first (backend spec §7): on-demand fetches
 * of specific announcement documents only, never bulk crawling; a declared
 * User-Agent carrying the configured contact; requests paced to one per
 * second with backoff and a retry budget on 429/403/5xx. The announcements
 * index is the public server-rendered year page (the platform's stable,
 * tokenless interface); each row names an idsId, which is the immutable
 * document identity the DOC# cache keys on.
 */

/** One request per second: politer than a browser on the same pages. */
const PACE_MS = 1_000;
const RETRY_BUDGET = 3;
/** Annual reports run to 30MB; anything past this is not a filing we read. */
const MAX_PDF_BYTES = 60 * 1024 * 1024;

export const announcementsYearUrl = (asxCode: string, year: number): string =>
  `https://www.asx.com.au/asx/v2/statistics/announcements.do?by=asxCode&asxCode=${encodeURIComponent(
    asxCode.toUpperCase()
  )}&timeframe=Y&year=${year}`;

export const displayAnnouncementUrl = (idsId: string): string =>
  `https://www.asx.com.au/asx/v2/statistics/displayAnnouncement.do?display=pdf&idsId=${idsId}`;

export interface MapAnnouncement {
  /** The MAP document id, immutable; the DOC# cache key. */
  idsId: string;
  /** Lodgement date as YYYY-MM-DD (Sydney time as printed). */
  date: string;
  headline: string;
  priceSensitive: boolean;
  pages?: number | undefined;
  fileSize?: string | undefined;
}

/**
 * Parse the announcements year page. Row shape (one <tr> per announcement):
 * a date cell, a price-sensitive marker cell, and an anchor to
 * displayAnnouncement.do carrying the headline text and page/size spans.
 * Regex over markup is deliberate: the page has kept this shape for over a
 * decade, and the parser is pure so a shape change is one fixture away.
 */
export function parseAnnouncementsPage(html: string): MapAnnouncement[] {
  const announcements: MapAnnouncement[] = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const ids = row?.match(/displayAnnouncement\.do\?display=pdf&(?:amp;)?idsId=(\d+)/);
    if (!ids?.[1] || row === undefined) continue;
    const date = row.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const headline = row.match(/idsId=\d+[^>]*>\s*([^<]+)/);
    if (!date || !headline?.[1]) continue;
    const pages = row.match(/<span class="page">\s*(\d+)/);
    const fileSize = row.match(/<span class="filesize">\s*([\d.]+\s*[A-Z]+)/i);
    announcements.push({
      idsId: ids[1],
      date: `${date[3]}-${date[2]}-${date[1]}`,
      headline: headline[1].replace(/\s+/g, ' ').trim(),
      priceSensitive: /title="price sensitive"/.test(row),
      pages: pages?.[1] === undefined ? undefined : Number(pages[1]),
      fileSize: fileSize?.[1]?.replace(/\s+/g, '')
    });
  }
  return announcements;
}

/** The listed name from the year page's heading ("CSL LIMITED (CSL)"). */
export function parseCompanyName(html: string): string | undefined {
  const match = html.match(/announcements for\s*(?:<br\s*\/?>)?\s*([^<(]+)\(/i);
  const name = match?.[1]?.replace(/\s+/g, ' ').trim();
  return name === undefined || name === '' ? undefined : name;
}

export interface AnnouncementsYear {
  announcements: MapAnnouncement[];
  companyName?: string | undefined;
}

export interface MapClientDeps {
  contact: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class MapClient {
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = 0;

  constructor(deps: MapClientDeps) {
    this.userAgent = `Plainsight ingest (${deps.contact})`;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = deps.now ?? Date.now;
  }

  private async request(url: string): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      const wait = this.lastRequestAt + PACE_MS - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
      const response = await this.fetchImpl(url, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(120_000)
      });
      if (response.status < 400) return response;
      const retryable = response.status === 429 || response.status === 403 || response.status >= 500;
      if (!retryable || attempt >= RETRY_BUDGET) {
        throw new Error(`${url}: HTTP ${response.status} after ${attempt} attempt(s)`);
      }
      await this.sleep(PACE_MS * 2 ** attempt * (0.5 + Math.random() / 2));
    }
  }

  /** The year's announcements for a code, newest first, as the page lists them. */
  async listAnnouncements(asxCode: string, year: number): Promise<MapAnnouncement[]> {
    return (await this.fetchAnnouncementsYear(asxCode, year)).announcements;
  }

  /** The year page in full: announcements plus the listed company name. */
  async fetchAnnouncementsYear(asxCode: string, year: number): Promise<AnnouncementsYear> {
    const response = await this.request(announcementsYearUrl(asxCode, year));
    const html = await response.text();
    const companyName = parseCompanyName(html);
    return {
      announcements: parseAnnouncementsPage(html),
      ...(companyName === undefined ? {} : { companyName })
    };
  }

  /**
   * Fetch one announcement document. The display endpoint either serves the
   * PDF directly or an interstitial page (price-sensitive documents) whose
   * body links the underlying asxpdf file; both paths end in verified PDF
   * bytes or a thrown error, never silent HTML.
   */
  async fetchAnnouncementPdf(idsId: string): Promise<Uint8Array> {
    const first = await this.request(displayAnnouncementUrl(idsId));
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    if (isPdf(firstBytes)) return checkSize(firstBytes, idsId);

    const interstitial = new TextDecoder().decode(firstBytes);
    const link = interstitial.match(/https?:\/\/[^"']*\/asxpdf\/[^"']+\.pdf|\/asxpdf\/[^"']+\.pdf/i);
    if (!link) {
      throw new Error(`announcement ${idsId}: neither a PDF nor an interstitial with one`);
    }
    const url = link[0].startsWith('http')
      ? link[0]
      : `https://announcements.asx.com.au${link[0]}`;
    const second = await this.request(url);
    const bytes = new Uint8Array(await second.arrayBuffer());
    if (!isPdf(bytes)) {
      throw new Error(`announcement ${idsId}: the linked document is not a PDF`);
    }
    return checkSize(bytes, idsId);
  }
}

const isPdf = (bytes: Uint8Array): boolean =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

function checkSize(bytes: Uint8Array, idsId: string): Uint8Array {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(`announcement ${idsId}: ${bytes.byteLength} bytes exceeds the document cap`);
  }
  return bytes;
}
