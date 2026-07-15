/**
 * Coordinate-ordered line assembly: text items grouped into lines by y,
 * ordered by x, with wide gaps rendered as a column separator so statement
 * tables stay readable as text. The algorithm and its thresholds are the
 * ones the golden-corpus transcription tooling proved against twelve real
 * annual reports; pure so it tests without a PDF.
 */

export interface TextItem {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** Items within this many points of a line's y belong to that line. */
const Y_TOLERANCE = 3;
/** A horizontal gap wider than this is a table-column boundary. */
const COLUMN_GAP = 18;
/** A gap wider than this (but not a column) is a word space. */
const WORD_GAP = 2;

export const COLUMN_SEPARATOR = '  |  ';

export function assembleLines(items: readonly TextItem[]): string[] {
  const drawn = items.filter((item) => item.str.trim() !== '');
  const sorted = [...drawn].sort((p, q) => q.y - p.y || p.x - q.x);

  const lines: { y: number; items: TextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) < Y_TOLERANCE);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }

  return lines.map((line) => {
    line.items.sort((p, q) => p.x - q.x);
    let out = '';
    let previousEnd: number | undefined;
    for (const item of line.items) {
      if (previousEnd !== undefined) {
        const gap = item.x - previousEnd;
        out += gap > COLUMN_GAP ? COLUMN_SEPARATOR : gap > WORD_GAP ? ' ' : '';
      }
      out += item.str;
      previousEnd = item.x + item.width;
    }
    return out;
  });
}
