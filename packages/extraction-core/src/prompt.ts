/**
 * The versioned prompt pack. Lowest-common-denominator by design (main plan
 * section 6): schema-first "respond only with JSON" prompting plus a single
 * repair retry works on every registered provider; per-provider structured
 * output and tool calling vary too much to build against. The line-item
 * dictionary is generated from the engine's canonical metadata so the prompt
 * and the entry grid can never disagree about what an item means, and the
 * reading rules are the ones the hand-built golden corpus proved out
 * (calc-engine fixtures/README.md interpretation notes).
 */
import { LINE_ITEMS, LINE_ITEM_IDS, type StatementKind } from '@plainsight/calc-engine';

export const EXTRACTION_PROMPT_VERSION = 'statements-1';

const STATEMENT_TITLES: Readonly<Record<StatementKind, string>> = {
  income: 'Income statement',
  balance: 'Balance sheet',
  cashflow: 'Cash flow statement'
};

function dictionary(): string {
  const groups: string[] = [];
  for (const statement of ['income', 'balance', 'cashflow'] as const) {
    const lines = LINE_ITEM_IDS.filter((id) => LINE_ITEMS[id].statement === statement).map(
      (id) => `- ${id}: ${LINE_ITEMS[id].label}. Find it as ${LINE_ITEMS[id].findItAs}.`
    );
    groups.push(`${STATEMENT_TITLES[statement]}:\n${lines.join('\n')}`);
  }
  return groups.join('\n\n');
}

/**
 * The instruction block sent with the prepared document (the adapter decides
 * how document text or page images travel). Deterministic: same version,
 * same text.
 */
export function buildExtractionPrompt(): string {
  return `You are reading a company's lodged financial report. Extract the CONSOLIDATED (group) financial statements into JSON. Ignore parent-entity columns, deed-of-cross-guarantee notes, and summary or highlights tables; read the statement faces and, where a figure only exists in a note (for example the weighted-average diluted share count), that note.

Return one entry per fiscal-year column you can read, most recent last. For each year:
- "fy": "FY" plus the calendar year of the period end (for example FY2025).
- "endDate": the exact period end printed in the statement heading, as YYYY-MM-DD. Retail 52/53-week calendars print exact dates; use them, never assume a month end.
- "currency": the ISO code of the statements' reporting currency.
- "scale": the printed money scale of the columns ("ones", "thousands", "millions", or "billions").
- "fields": the line items below, each as {"value": number, "page": printedPageNumber, "confidence": 0 to 1}.

Rules, in order of importance:
1. Copy figures exactly as printed at the stated scale. Never convert, derive, or aggregate a figure the filing does not print, with one exception: where interest or finance costs print as two adjacent face lines and no total exists, their sum is acceptable; say so in "warnings".
2. Signs: report losses, outflows, and credit balances as negative numbers (an operating loss, a pretax loss, an income tax benefit, a negative operating cash flow). All other magnitudes are positive.
3. A printed dash or nil IS a printed value: report 0. A line the statements clearly do not carry at all (for example no borrowings line anywhere on the balance sheet) is {"notPrinted": true, "confidence": ...}. If you cannot determine an item, omit it entirely; never guess.
4. "netIncome" is profit attributable to owners of the parent when an attribution split is printed; "totalEquity" INCLUDES non-controlling interests.
5. "dilutedShares" is the weighted-average diluted share count as an exact number of shares, whatever scale the note uses.
6. When the face prints a diluted earnings per share, include "dilutedEps": {"value": ..., "unit": "dollars" or "cents", "page": ..., "confidence": ...} for the year.
7. "page" is the printed page number you read the figure from (the number on the page, not a scan index).
8. "confidence" is honest: 1.0 only for a clean printed figure you are certain of; lower it for smudged scans, ambiguous labels, or judgement calls.
9. Put anything a careful owner should know (restatements, re-presented comparatives, discontinued operations, missing statements) in "warnings" as short sentences.

Line items:

${dictionary()}

Respond with ONLY this JSON object, no prose and no code fences:
{"years": [{"fy": "...", "endDate": "...", "currency": "...", "scale": "...", "fields": {"revenue": {"value": 0, "page": 1, "confidence": 1}}, "dilutedEps": {"value": 0, "unit": "cents", "page": 1, "confidence": 1}}], "warnings": []}`;
}

/** The single repair retry: same contract, with what went wrong the first time. */
export function buildRepairPrompt(problem: string): string {
  return `Your previous response could not be used: ${problem}. Respond again with ONLY the JSON object described before, no prose and no code fences, correcting that problem. Do not change figures you already read correctly.`;
}
