import { describe, expect, it } from 'vitest';

import { COLUMN_SEPARATOR, openPdf, preprocessPdf } from '../src/pdf/index.js';
import { buildPdf, type MiniPage } from './helpers/minipdf.js';

/** A statement-face page: title, labelled rows, a dense numbers grid, footer. */
function face(title: string, labels: string[], footer: string): MiniPage {
  const texts = [{ x: 50, y: 800, str: title }];
  labels.forEach((label, index) => {
    texts.push({ x: 50, y: 760 - index * 20, str: label });
    texts.push({ x: 300, y: 760 - index * 20, str: `${1 + index},${234 + index}.5` });
  });
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      texts.push({ x: 300 + column * 60, y: 600 - row * 18, str: `${row * 4 + column + 1},101.${row}` });
    }
  }
  texts.push({ x: 280, y: 30, str: footer });
  return { texts };
}

const contentsPage: MiniPage = {
  texts: [
    { x: 50, y: 800, str: 'Contents' },
    { x: 50, y: 760, str: 'Income statement' },
    { x: 400, y: 760, str: '57' },
    { x: 50, y: 740, str: 'Balance sheet' },
    { x: 400, y: 740, str: '58' }
  ]
};

const prosePage: MiniPage = {
  texts: [
    {
      x: 50,
      y: 700,
      str: 'The directors present their report on the consolidated entity for the year ended 30 June 2025, together with sundry governance matter.'
    }
  ]
};

const epsNotePage = (footer: string): MiniPage => ({
  texts: [
    { x: 50, y: 740, str: 'Earnings per share' },
    {
      x: 50,
      y: 720,
      str: 'The calculation of diluted EPS has been based on the following net profit attributable to equity'
    },
    {
      x: 50,
      y: 700,
      str: 'holders of the parent entity and weighted average number of shares outstanding after adjustments'
    },
    { x: 50, y: 680, str: 'for the effects of all dilutive potential ordinary shares.' },
    { x: 50, y: 660, str: 'Weighted average number of ordinary shares (diluted)' },
    { x: 400, y: 660, str: '65,606,224' },
    { x: 280, y: 30, str: footer }
  ]
});

const incomeFace = face('Income statement', ['Revenue', 'Gross profit', 'Profit before income tax'], '57');
const balanceFace = face('Balance sheet', ['Total current assets', 'Total equity'], '58');
const cashflowFace = face(
  'Statement of cash flows',
  ['Net cash provided by operating activities'],
  '59'
);

describe('preprocessPdf', () => {
  it('locates the faces, confirms printed pages from footers, and assembles text sections', async () => {
    // Stray standalone integers in the headers (note references, column
    // keys) must lose the offset vote to the running footer.
    const incomeWithNoise: MiniPage = {
      texts: [...incomeFace.texts, { x: 520, y: 800, str: '7' }]
    };
    const cashflowWithNoise: MiniPage = {
      texts: [...cashflowFace.texts, { x: 520, y: 800, str: '11' }]
    };
    const pdf = buildPdf([
      contentsPage,
      prosePage,
      incomeWithNoise,
      balanceFace,
      cashflowWithNoise,
      epsNotePage('60'),
      prosePage
    ]);
    const outcome = await preprocessPdf(pdf);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.pageCount).toBe(7);
    expect(outcome.needsVision).toBe(false);
    expect(outcome.window).toEqual({ from: 3, to: 5, epsNotePage: 6 });
    expect(outcome.document.sections.map((section) => section.page)).toEqual([57, 58, 59, 60]);
    const income = outcome.document.sections[0]?.text ?? '';
    expect(income).toContain('Income statement');
    expect(income).toContain(`Revenue${COLUMN_SEPARATOR}1,234.5`);
    expect(outcome.document.sections.every((section) => section.imagePngBase64 === undefined)).toBe(
      true
    );
  });

  it('reads real coordinates through pdfjs and exposes pages to the rasteriser', async () => {
    const pdf = await openPdf(buildPdf([contentsPage]));
    expect(pdf.pageCount).toBe(1);
    const lines = await pdf.pageLines(1);
    expect(lines[0]).toBe('Contents');
    expect(lines[1]).toBe(`Income statement${COLUMN_SEPARATOR}57`);
    const page = await pdf.getPage(1);
    expect(page.getViewport({ scale: 1 }).width).toBe(595);
    await pdf.destroy();
  });

  it('rasterises the window when a page inside it has no text layer', async () => {
    const scannedInsert: MiniPage = { texts: [] };
    const pdf = buildPdf([
      contentsPage,
      prosePage,
      incomeFace,
      scannedInsert,
      cashflowFace,
      epsNotePage('60'),
      prosePage
    ]);

    const without = await preprocessPdf(pdf);
    expect(without).toMatchObject({ ok: false, reason: 'rasteriser_required' });

    const rendered: number[] = [];
    const outcome = await preprocessPdf(pdf, {
      rasterisePage: (pageNumber) => {
        rendered.push(pageNumber);
        return Promise.resolve('UE5H');
      }
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.needsVision).toBe(true);
    expect(rendered).toEqual([3, 4, 5, 6]);
    expect(outcome.document.sections.every((section) => section.imagePngBase64 === 'UE5H')).toBe(
      true
    );
    // The scanned insert has no footer, so it carries no page claim.
    expect(outcome.document.sections.map((section) => section.page)).toEqual([57, undefined, 59, 60]);
  });

  it('calls a whole scan a scanned document', async () => {
    const empty: MiniPage = { texts: [] };
    const outcome = await preprocessPdf(buildPdf([empty, empty, empty]));
    expect(outcome).toEqual({ ok: false, reason: 'scanned_document', pageCount: 3 });
  });

  it('says so when a text-rich document has no statements', async () => {
    const outcome = await preprocessPdf(buildPdf([prosePage, prosePage, prosePage]));
    expect(outcome).toEqual({ ok: false, reason: 'statements_not_found', pageCount: 3 });
  });

  it('withholds page numbers when the footers cannot form a majority', async () => {
    const unnumbered = (title: string, labels: string[]): MiniPage => {
      const built = face(title, labels, 'x');
      return { texts: built.texts.filter((text) => text.str !== 'x') };
    };
    const outcome = await preprocessPdf(
      buildPdf([
        unnumbered('Income statement', ['Revenue', 'Gross profit']),
        unnumbered('Balance sheet', ['Total current assets', 'Total equity'])
      ])
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.document.sections.map((section) => section.page)).toEqual([
      undefined,
      undefined
    ]);
  });
});
