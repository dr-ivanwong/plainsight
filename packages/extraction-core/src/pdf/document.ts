/**
 * The thin pdfjs wrapper. The legacy build runs in Node and in the browser
 * alike (browser consumers may still set GlobalWorkerOptions.workerSrc to
 * move parsing off the main thread); everything interesting happens in the
 * pure modules around it. This subpath is deliberately not re-exported from
 * the package root: pdfjs is heavy, and the web shell must never carry it
 * (main plan section 6, lazy-loaded chunk).
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import { assembleLines, type TextItem } from './lines.js';

/**
 * pdfjs text content mixes drawn text with marked-content markers; only the
 * former carry a string and coordinates. Exported for its unit test.
 */
export function textItemsOf(items: readonly unknown[]): TextItem[] {
  const drawn: TextItem[] = [];
  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'str' in item) {
      const raw = item as { str: string; transform: number[]; width: number };
      drawn.push({ str: raw.str, x: raw.transform[4]!, y: raw.transform[5]!, width: raw.width });
    }
  }
  return drawn;
}

export interface PdfText {
  readonly pageCount: number;
  /** Coordinate-ordered text lines of a 1-based page. */
  pageLines(pageNumber: number): Promise<string[]>;
  /** The underlying pdfjs page, for the rasteriser. */
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  destroy(): Promise<void>;
}

export async function openPdf(data: Uint8Array): Promise<PdfText> {
  // pdfjs transfers (and detaches) the buffer it is given; copy so callers
  // keep ownership and a document can be opened twice from the same bytes.
  const loadingTask = getDocument({ data: data.slice(), useSystemFonts: true });
  const doc: PDFDocumentProxy = await loadingTask.promise;
  return {
    pageCount: doc.numPages,
    async pageLines(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      return assembleLines(textItemsOf(content.items));
    },
    getPage: (pageNumber) => doc.getPage(pageNumber),
    destroy: () => loadingTask.destroy()
  };
}
