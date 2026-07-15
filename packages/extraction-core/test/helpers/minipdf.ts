/**
 * A tiny uncompressed PDF builder so the preprocessor tests are hermetic:
 * real annual reports are copyrighted and megabytes, and pdfjs only needs a
 * structurally honest document. Each page draws text runs at coordinates
 * with the built-in Helvetica, which pdfjs measures for real widths.
 */

export interface MiniText {
  readonly x: number;
  readonly y: number;
  readonly str: string;
  readonly size?: number;
}

export interface MiniPage {
  readonly texts: readonly MiniText[];
}

const escapeString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export function buildPdf(pages: readonly MiniPage[]): Uint8Array {
  // Objects: 1 catalog, 2 page tree, 3 font, then page and content pairs.
  const objects: string[] = [];
  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (const [index, page] of pages.entries()) {
    const contentNumber = pageObjectNumbers[index]! + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`
    );
    const stream = page.texts
      .map(
        (text) =>
          `BT /F1 ${text.size ?? 10} Tf ${text.x} ${text.y} Td (${escapeString(text.str)}) Tj ET`
      )
      .join('\n');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
