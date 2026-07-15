/**
 * PDF preprocessing (backend spec section 6, the preprocessing stage): text
 * layer out, statements located, vision need detected, and the prepared
 * document assembled for the ladder. Printed page numbers are recovered from
 * the running footers only where the whole window votes for one offset and
 * the page's own footer confirms it; a page that cannot be confirmed keeps
 * its footer text and simply carries no page claim, which the prompt treats
 * as "cite what you can read".
 */
import type { PreparedDocument, PreparedSection } from '../provider.js';
import { openPdf } from './document.js';
import { SPARSE_PAGE_CHARS, locateStatements, type StatementsWindow } from './locator.js';

export interface PreprocessOptions {
  /** makePageRasteriser output; required only when the window needs vision. */
  readonly rasterisePage?: (pageNumber: number) => Promise<string>;
}

export type PreprocessOutcome =
  | {
      readonly ok: true;
      readonly document: PreparedDocument;
      readonly needsVision: boolean;
      readonly window: StatementsWindow;
      readonly pageCount: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'scanned_document' | 'statements_not_found' | 'rasteriser_required';
      readonly pageCount: number;
    };

/**
 * Standalone integers in a page's edge lines: printed-page candidates. The
 * lookarounds reject fragments of larger figures (the 101 in 25,101.6 and
 * the 5 in 1,234.5), which statement grids are full of.
 */
function footerCandidates(lines: readonly string[]): number[] {
  const edges = [...lines.slice(0, 2), ...lines.slice(-2)];
  const candidates: number[] = [];
  for (const line of edges) {
    for (const match of line.matchAll(/(?<![\d.,])(\d{1,4})(?![\d.,])/g)) {
      candidates.push(Number(match[1]));
    }
  }
  return candidates;
}

/**
 * The one printed-minus-pdf offset the window's footers agree on, if they
 * agree: report years and money figures in edge lines produce a different
 * offset on every page and never form a majority, while a running page
 * number produces the same offset throughout. Spread layouts (two printed
 * pages per pdf page) have no constant offset and honestly return nothing.
 */
function printedOffset(pages: readonly (readonly string[])[], windowPages: readonly number[]): number | undefined {
  const votes = new Map<number, number>();
  for (const pageNumber of windowPages) {
    for (const candidate of footerCandidates(pages[pageNumber - 1]!)) {
      const offset = candidate - pageNumber;
      votes.set(offset, (votes.get(offset) ?? 0) + 1);
    }
  }
  let best: { offset: number; count: number } | undefined;
  for (const [offset, count] of votes) {
    if (best === undefined || count > best.count) best = { offset, count };
  }
  const needed = Math.max(2, Math.ceil(windowPages.length / 2));
  return best !== undefined && best.count >= needed ? best.offset : undefined;
}

export async function preprocessPdf(
  data: Uint8Array,
  options: PreprocessOptions = {}
): Promise<PreprocessOutcome> {
  const pdf = await openPdf(data);
  try {
    const pages: string[][] = [];
    for (let pageNumber = 1; pageNumber <= pdf.pageCount; pageNumber += 1) {
      pages.push(await pdf.pageLines(pageNumber));
    }
    const chars = pages.map((lines) => lines.join('\n').length);

    // A document whose typical page has no text layer is a scan end to end;
    // locating statements in it is a vision problem this stage does not
    // solve, so say so rather than returning an empty window.
    const sortedChars = [...chars].sort((a, b) => a - b);
    const medianChars = sortedChars[Math.floor(sortedChars.length / 2)]!;
    if (medianChars < SPARSE_PAGE_CHARS / 2) {
      return { ok: false, reason: 'scanned_document', pageCount: pdf.pageCount };
    }

    const window = locateStatements(pages);
    if (window === undefined) {
      return { ok: false, reason: 'statements_not_found', pageCount: pdf.pageCount };
    }

    const windowPages: number[] = [];
    for (let pageNumber = window.from; pageNumber <= window.to; pageNumber += 1) {
      windowPages.push(pageNumber);
    }
    if (window.epsNotePage !== undefined && window.epsNotePage > window.to) {
      windowPages.push(window.epsNotePage);
    }

    const needsVision = windowPages.some((pageNumber) => chars[pageNumber - 1]! < SPARSE_PAGE_CHARS);
    if (needsVision && options.rasterisePage === undefined) {
      return { ok: false, reason: 'rasteriser_required', pageCount: pdf.pageCount };
    }

    const offset = printedOffset(pages, windowPages);
    const sections: PreparedSection[] = [];
    for (const pageNumber of windowPages) {
      const lines = pages[pageNumber - 1]!;
      const printed =
        offset !== undefined && footerCandidates(lines).includes(pageNumber + offset)
          ? pageNumber + offset
          : undefined;
      const section: PreparedSection = {
        ...(printed !== undefined ? { page: printed } : {}),
        text: lines.join('\n'),
        ...(needsVision && options.rasterisePage !== undefined
          ? { imagePngBase64: await options.rasterisePage(pageNumber) }
          : {})
      };
      sections.push(section);
    }

    return {
      ok: true,
      document: { sections },
      needsVision,
      window,
      pageCount: pdf.pageCount
    };
  } finally {
    await pdf.destroy();
  }
}
