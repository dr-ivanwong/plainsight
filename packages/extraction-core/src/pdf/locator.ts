/**
 * The statements-section locator: annual reports run one to two hundred
 * pages, and only a handful carry the statements, so the window keeps token
 * cost proportional to the statements, not the report. Tuned against the
 * seventeen golden-corpus documents. What distinguishes the audited faces
 * from everything that mimics them (contents pages, results-announcement
 * summaries, five-year reviews) is not any single page but the set: a
 * candidate window only counts when it holds all three statement kinds AND
 * the statutory dressing (the read-in-conjunction or integral-part footer,
 * or the for-the-year-ended/as-at subtitle where, like Wesfarmers, no
 * footer sentence is printed).
 */

const STRONG_INCOME =
  /statement of profit or loss|income statement|statement of (other )?comprehensive income/i;
const STRONG_BALANCE = /balance sheet|statement of financial position/i;
const STRONG_CASHFLOW = /statement of cash flows|cash flow statement/i;
/**
 * A heading SEGMENT starts with the title (prose that mentions a statement
 * does not); the period often rides the same line, hence the generous cap.
 */
const HEADING =
  /^(consolidated\s+)?(statement of profit or loss|income statement|statement of comprehensive income|statements? of financial position|balance sheet|statement of cash flows|cash flow statement|statement of changes in equity)/i;
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
/** The diluted share-count disclosure, not merely the basic EPS table. */
const EPS_NOTE = /weighted average number of|denominator in calculating/i;
const DILUTED = /diluted/i;
const CONJUNCTION = /read in conjunction with|integral part of these/i;
const PERIOD_PHRASE = /for the (financial )?(year|(\d+[- ]week )?period) ended|as at \d{1,2} \w+ \d{4}/i;

/** A page with fewer characters than this has no usable text layer. */
export const SPARSE_PAGE_CHARS = 200;
/** Statement faces plus changes in equity never legitimately exceed this. */
const WINDOW_CAP = 12;
/** How far past the faces the EPS note is sought. */
const EPS_NOTE_REACH = 50;
/** A statement page carries at least this many numeric tokens. */
const DENSE_NUMBERS = 25;
const HEADING_SEGMENT_CHARS = 100;
const SEGMENT_SPLIT = /\s{2,}\|\s{2,}/;

export interface PageSignals {
  readonly heading: boolean;
  readonly strongIncome: boolean;
  readonly strongBalance: boolean;
  readonly strongCashflow: boolean;
  readonly conjunction: boolean;
  readonly periodPhrase: boolean;
  readonly weakCount: number;
  readonly numberTokens: number;
  readonly chars: number;
}

/** How many top-of-page lines can carry the title. */
const HEADING_LINES = 12;

function hasHeading(lines: readonly string[]): boolean {
  const top = lines.slice(0, HEADING_LINES);
  const candidates: string[] = [];
  for (const [index, line] of top.entries()) {
    candidates.push(...line.split(SEGMENT_SPLIT));
    // Narrow columns break a title across two lines (the 2017-era CSL
    // reports print CONSOLIDATED STATEMENT / OF COMPREHENSIVE INCOME).
    const next = top[index + 1];
    if (next !== undefined) candidates.push(`${line} ${next}`);
  }
  return candidates.some((candidate) => {
    const trimmed = candidate.trim();
    return trimmed.length <= HEADING_SEGMENT_CHARS && HEADING.test(trimmed);
  });
}

export function pageSignals(lines: readonly string[]): PageSignals {
  // Phrase tests run over space-joined text so a phrase split across
  // extracted lines still counts.
  const text = lines.join(' ');
  return {
    heading: hasHeading(lines),
    strongIncome: STRONG_INCOME.test(text),
    strongBalance: STRONG_BALANCE.test(text),
    strongCashflow: STRONG_CASHFLOW.test(text),
    conjunction: CONJUNCTION.test(text),
    periodPhrase: PERIOD_PHRASE.test(text),
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

/** A window seeds on an income or balance heading over a labelled grid. */
const anchors = (signals: PageSignals): boolean =>
  signals.heading &&
  (signals.strongIncome || signals.strongBalance) &&
  signals.weakCount >= 2 &&
  signals.numberTokens >= DENSE_NUMBERS;

/** Faces and the changes-in-equity grid belong to the run. */
const continues = (signals: PageSignals): boolean =>
  signals.numberTokens >= DENSE_NUMBERS && (strongAny(signals) || signals.weakCount >= 1);

interface Extent {
  readonly from: number;
  readonly to: number;
}

/**
 * Grow the window around the anchor. Backward first, because the anchor may
 * be the balance sheet with the income statement pages before it: a page
 * joins backward only if it wears a face's dressing (the period subtitle or
 * the conjunction footer), which keeps the financial report's own table of
 * contents out however face-like its note numbers look. Forward, a page
 * joins while it reads like a statement grid, and the window closes at the
 * first non-heading page once all three statements have been seen: that
 * boundary is where the notes begin.
 */
function extendWindow(signals: readonly PageSignals[], anchor: number): Extent {
  let from = anchor;
  for (let page = anchor - 1; page >= 1 && anchor - page <= 3; page -= 1) {
    const current = signals[page - 1]!;
    if (continues(current) && (current.conjunction || current.periodPhrase)) {
      from = page;
    } else {
      break;
    }
  }

  const seen = { income: false, balance: false, cashflow: false };
  const absorb = (page: number) => {
    const signal = signals[page - 1]!;
    seen.income ||= signal.strongIncome;
    seen.balance ||= signal.strongBalance;
    seen.cashflow ||= signal.strongCashflow;
  };
  for (let page = from; page <= anchor; page += 1) absorb(page);

  let to = anchor;
  let misses = 0;
  for (let page = anchor + 1; page <= signals.length && to - from + 1 < WINDOW_CAP; page += 1) {
    const current = signals[page - 1]!;
    if (seen.income && seen.balance && seen.cashflow && !current.heading) break;
    if (continues(current)) {
      to = page;
      misses = 0;
      absorb(page);
    } else if (misses === 0) {
      misses = 1;
    } else {
      break;
    }
  }
  return { from, to };
}

/** The audited set: all three statements, wearing the statutory dressing. */
function acceptable(signals: readonly PageSignals[], extent: Extent): boolean {
  const window = signals.slice(extent.from - 1, extent.to);
  return (
    window.some((page) => page.strongIncome) &&
    window.some((page) => page.strongBalance) &&
    window.some((page) => page.strongCashflow) &&
    window.some((page) => page.conjunction || page.periodPhrase)
  );
}

export function locateStatements(
  pages: readonly (readonly string[])[]
): StatementsWindow | undefined {
  const signals = pages.map(pageSignals);

  for (let candidate = 1; candidate <= pages.length; candidate += 1) {
    if (!anchors(signals[candidate - 1]!)) continue;
    const extent = extendWindow(signals, candidate);
    if (!acceptable(signals, extent)) continue;

    const reachEnd = Math.min(pages.length, extent.to + EPS_NOTE_REACH);
    for (let page = extent.from; page <= reachEnd; page += 1) {
      const text = pages[page - 1]!.join('\n');
      if (EPS_NOTE.test(text) && DILUTED.test(text)) {
        return { from: extent.from, to: extent.to, epsNotePage: page };
      }
    }
    return { from: extent.from, to: extent.to };
  }
  return undefined;
}
