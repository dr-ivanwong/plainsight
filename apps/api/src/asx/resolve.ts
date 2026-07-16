/**
 * Statutory-report resolution: given a year's announcements, pick the
 * lodgement that carries the audited financial statements. The vocabulary
 * is the corpus's own: CSL lodges "Statutory Accounts", JB Hi-Fi an
 * "Appendix 4E and Financial Report", Wesfarmers an "Annual Report
 * including Appendix 4E", Woolworths and Cochlear an "Annual Report".
 * Statutory-flavoured headlines outrank plain annual reports (JB Hi-Fi's
 * glossy annual report carries no statements at all), and within a tier the
 * fattest document wins: the statements are always in the thick one.
 */
import type { MapAnnouncement } from './client.js';

/** Headlines that can carry the statements at all. */
const INCLUDE =
  /annual report|statutory accounts|appendix 4e|full[- ]?year[^,]{0,40}(financial report|statutory|accounts)|annual financial report|financial report/i;
/** Adjacent lodgement noise: summaries, governance, meetings, media. */
const EXCLUDE =
  /presentation|notice|notification|governance|appendix 4g|appendix 3|briefing|extract|concise|transcript|speech|\bagm\b|proxy|media release|investor|results announcement|report to shareholders|cessation|buy-back|change of|update -/i;
/** The statutory tier: these are the statements by name. */
const STATUTORY = /statutory|financial report|appendix 4e/i;

/**
 * Calendar years whose announcements page can carry the lodgement for a
 * fiscal year: reports lodge one to four months after balance date, so a
 * September-or-later end spills into the next calendar year.
 */
export function lodgementYears(fyEndDate: string): number[] {
  const year = Number(fyEndDate.slice(0, 4));
  const month = Number(fyEndDate.slice(5, 7));
  return month >= 9 ? [year, year + 1] : [year];
}

/** Days after balance date within which the statutory report lodges. */
const LODGEMENT_WINDOW_DAYS = 240;
/** Three statements plus notes never print thinner than this. */
const MIN_REPORT_PAGES = 40;

export function resolveStatutoryReport(
  announcements: readonly MapAnnouncement[],
  fyEndDate: string
): MapAnnouncement | undefined {
  const windowStart = Date.parse(fyEndDate);
  const windowEnd = windowStart + LODGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return pickStatutory(
    announcements.filter((announcement) => {
      const lodged = Date.parse(announcement.date);
      return lodged > windowStart && lodged <= windowEnd;
    })
  );
}

/**
 * The statutory lodgements across whatever announcements were fetched, one
 * per lodgement season, newest first: the on-demand ASX ingest's backfill
 * reads the last few year pages and takes the top of this list. Companies
 * lodge one statutory report per fiscal year, so grouping by the calendar
 * year of lodgement is grouping by fiscal year for every 30 June balancer
 * and remains one-per-season for the rest.
 */
export function resolveStatutoryReports(
  announcements: readonly MapAnnouncement[]
): MapAnnouncement[] {
  const bySeason = new Map<number, MapAnnouncement[]>();
  for (const announcement of announcements) {
    const year = Number(announcement.date.slice(0, 4));
    const season = bySeason.get(year);
    if (season === undefined) bySeason.set(year, [announcement]);
    else season.push(announcement);
  }
  const picks: MapAnnouncement[] = [];
  for (const season of bySeason.values()) {
    const pick = pickStatutory(season);
    if (pick !== undefined) picks.push(pick);
  }
  return picks.sort((a, b) => b.date.localeCompare(a.date));
}

function pickStatutory(inWindow: readonly MapAnnouncement[]): MapAnnouncement | undefined {
  const candidates = inWindow.filter(
    (announcement) =>
      INCLUDE.test(announcement.headline) && !EXCLUDE.test(announcement.headline)
  );
  if (candidates.length === 0) return undefined;

  const byWeight = (tier: readonly MapAnnouncement[]): MapAnnouncement | undefined =>
    [...tier].sort(
      (a, b) => (b.pages ?? 0) - (a.pages ?? 0) || b.date.localeCompare(a.date)
    )[0];

  // A document carrying three statements plus notes is never thin: Cochlear
  // lodges a one-page "Appendix 4E" cover alongside its annual report, and
  // the statutory tier must not let the cover outrank the statements.
  const plausible = (candidate: MapAnnouncement | undefined): MapAnnouncement | undefined =>
    candidate !== undefined && candidate.pages !== undefined && candidate.pages < MIN_REPORT_PAGES
      ? undefined
      : candidate;

  return (
    plausible(byWeight(candidates.filter((candidate) => STATUTORY.test(candidate.headline)))) ??
    plausible(byWeight(candidates)) ??
    byWeight(candidates)
  );
}
