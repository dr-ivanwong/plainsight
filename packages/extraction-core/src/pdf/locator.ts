/**
 * The statements-section locator: annual reports run one to two hundred
 * pages, and only a handful carry the statements, so the window keeps token
 * cost proportional to the statements, not the report. The heuristics are
 * the ones that held across the twelve golden-corpus reports: a real
 * statement face carries a statement title AND a dense grid of numbers,
 * which is exactly what a contents page (titles, sparse numbers) and a
 * five-year summary (numbers, no titles) each lack.
 */

const STRONG_INCOME = /statement of profit or loss|income statement/i;
const STRONG_BALANCE = /balance sheet|statement of financial position/i;
const STRONG_CASHFLOW = /statement of cash flows|cash flow statement/i;
const WEAK_LABELS = [
  /total current assets/i,
  /total liabilities/i,
  /total equity/i,
  /gross profit/i,
  /profit before (income )?tax/i,
  /net cash (provided by|from|inflow|outflow|used in|flows from)/i,
  /earnings per share/i
];
const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;
const EPS_NOTE = /weighted average number of|denominator in calculating/i;

/** A page with fewer characters than this has no usable text layer. */
export const SPARSE_PAGE_CHARS = 200;
/** Statement faces plus changes in equity never legitimately exceed this. */
const WINDOW_CAP = 12;
/** How far past the faces the EPS note is sought. */
const EPS_NOTE_REACH = 50;
/** A statement page carries at least this many numeric tokens. */
const DENSE_NUMBERS = 25;

export interface PageSignals {
  readonly strongIncome: boolean;
  readonly strongBalance: boolean;
  readonly strongCashflow: boolean;
  readonly weakCount: number;
  readonly numberTokens: number;
  readonly chars: number;
}

export function pageSignals(lines: readonly string[]): PageSignals {
  const text = lines.join('\n');
  return {
    strongIncome: STRONG_INCOME.test(text),
    strongBalance: STRONG_BALANCE.test(text),
    strongCashflow: STRONG_CASHFLOW.test(text),
    weakCount: WEAK_LABELS.filter((label) => label.test(text)).length,
    numberTokens: text.match(NUMBER_TOKEN)?.length ?? 0,
    chars: text.length
  };
}

export interface StatementsWindow {
  /** 1-based pdf page indexes, inclusive. */
  readonly from: number;
  readonly to: number;
  /** The diluted share-count note, when found within reach of the faces. */
  readonly epsNotePage?: number;
}

const strongAny = (signals: PageSignals): boolean =>
  signals.strongIncome || signals.strongBalance || signals.strongCashflow;

/** The window opens on an income or balance face with a dense number grid. */
const anchors = (signals: PageSignals): boolean =>
  (signals.strongIncome || signals.strongBalance) &&
  (signals.weakCount >= 2 || signals.numberTokens >= DENSE_NUMBERS);

/** Later faces and the changes-in-equity grid keep the window open. */
const continues = (signals: PageSignals): boolean =>
  signals.numberTokens >= DENSE_NUMBERS && (strongAny(signals) || signals.weakCount >= 1);

export function locateStatements(pages: readonly (readonly string[])[]): StatementsWindow | undefined {
  const signals = pages.map(pageSignals);
  const from = signals.findIndex(anchors) + 1;
  if (from === 0) return undefined;

  let to = from;
  let misses = 0;
  for (let page = from + 1; page <= pages.length && to - from + 1 < WINDOW_CAP; page += 1) {
    const current = signals[page - 1]!;
    // A page with no text layer inside the run cannot prove itself; tolerate
    // one, like any other single dead page (a full-page chart, a divider).
    if (continues(current)) {
      to = page;
      misses = 0;
    } else if (misses === 0) {
      misses = 1;
    } else {
      break;
    }
  }

  const reachEnd = Math.min(pages.length, to + EPS_NOTE_REACH);
  for (let page = from; page <= reachEnd; page += 1) {
    if (EPS_NOTE.test(pages[page - 1]!.join('\n'))) {
      return { from, to, epsNotePage: page };
    }
  }
  return { from, to };
}
