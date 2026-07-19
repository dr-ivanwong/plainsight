/**
 * The detail sheet's arithmetic (frontend spec section 3, the metric detail
 * sheet): the pinned formula with the actual figures substituted, honest about
 * the averaged denominator basis (data-model section 4) and stating the ROIC
 * and FCF intermediates plainly, as their dictionary notes require (data-model
 * section 6). Pure over a resolve callback so every emitted equation is
 * testable by evaluation: a substituted line that does not reproduce the
 * displayed value is the product's definition of a P0 bug (main plan
 * section 13), so the arithmetic here reuses the engine's own exported
 * helpers rather than a parallel derivation.
 */
import {
  effectiveTaxRate,
  formatMetricValue,
  formatMoneyMinor,
  formatPercent,
  fyLabelOf,
  fyYear,
  investedCapital,
  LINE_ITEMS,
  METRICS,
  nopat,
  type CurrencyCode,
  type FyLabel,
  type LineItemId,
  type MetricId,
  type MetricValue
} from '@plainsight/calc-engine';

/** Resolves a line item to its computable minor amount in one year; null when unknown. */
export type ResolveAmount = (itemId: LineItemId, fy: FyLabel) => number | null;

export interface DerivedFigureRow {
  id: string;
  label: string;
  /** The row's own arithmetic, so the figure proves itself: '($400 + $360) ÷ 2 = $380'. */
  text: string;
}

export interface SheetDerivation {
  /** The pinned formula in words, naming the averaged denominator when one was used. */
  humanisedFormula: string;
  /** The substituted equation ending '= value', or null when any operand is unknown. */
  substituted: string | null;
  /** Prior-year inputs to list with their provenance (averaged basis only). */
  priorInputs: readonly LineItemId[];
  /** Derived figures, listed beneath the inputs, each carrying its arithmetic. */
  derivedRows: readonly DerivedFigureRow[];
  /** The prior fiscal year the averaged denominator read, when it did. */
  priorFy: FyLabel | null;
}

/** Replace each line-item token in a pinned formula through the given mapping. */
export function replaceTokens(
  formula: string,
  replacer: (id: LineItemId) => string | null
): string {
  let text = formula;
  for (const id of Object.keys(LINE_ITEMS) as LineItemId[]) {
    const replacement = replacer(id);
    if (replacement !== null) {
      text = text.replace(new RegExp(`\\b${id}\\b`, 'g'), replacement);
    }
  }
  return text;
}

const INVESTED_CAPITAL_ITEMS: readonly LineItemId[] = [
  'shortTermDebt',
  'longTermDebt',
  'totalEquity',
  'cashAndEquivalents'
];

export interface SheetDerivationArgs {
  metricId: MetricId;
  latest: MetricValue | null;
  latestFy: FyLabel | null;
  currency: CurrencyCode;
  resolve: ResolveAmount;
  /** Formats one line item's amount for substitution (money, or a plain count). */
  amountText: (itemId: LineItemId, amountMinor: number) => string;
  /** The share price already formatted in its own currency; null when not entered. */
  priceText: string | null;
}

export function deriveSheetFigures(args: SheetDerivationArgs): SheetDerivation {
  const { metricId, latest, latestFy, currency, resolve, amountText, priceText } = args;
  const def = METRICS[metricId];
  const money = (minor: number): string => formatMoneyMinor(minor, currency);
  const labelled = replaceTokens(def.formula, (id) => LINE_ITEMS[id].label.toLowerCase());

  const okLatest = latest !== null && latest.status === 'ok' ? latest : null;
  if (okLatest === null || latestFy === null) {
    return {
      humanisedFormula: labelled,
      substituted: null,
      priorInputs: [],
      derivedRows: [],
      priorFy: null
    };
  }

  const displayed = formatMetricValue(okLatest, def.format, currency);
  // The averaged basis reads the year labelled one prior (data-model
  // section 4), the same label arithmetic the engine's lookup uses.
  const priorFy = okLatest.basis === 'average' ? fyLabelOf(fyYear(latestFy) - 1) : null;
  const latestAmount = (id: LineItemId): number | null => resolve(id, latestFy);

  if (metricId === 'roe') {
    const netIncome = latestAmount('netIncome');
    const closing = latestAmount('totalEquity');
    const opening = priorFy === null ? null : resolve('totalEquity', priorFy);
    const denominator =
      priorFy === null
        ? closing
        : closing === null || opening === null
          ? null
          : (closing + opening) / 2;
    const derivedRows: DerivedFigureRow[] = [];
    if (priorFy !== null && closing !== null && opening !== null && denominator !== null) {
      derivedRows.push({
        id: 'averageTotalEquity',
        label: 'Average total equity',
        text: `(${money(closing)} + ${money(opening)}) ÷ 2 = ${money(denominator)}`
      });
    }
    return {
      humanisedFormula:
        priorFy === null ? labelled : labelled.replace('total equity', 'average total equity'),
      substituted:
        netIncome === null || denominator === null
          ? null
          : `${money(netIncome)} ÷ ${money(denominator)} = ${displayed}`,
      priorInputs: priorFy === null ? [] : ['totalEquity'],
      derivedRows,
      priorFy
    };
  }

  if (metricId === 'roic') {
    const operatingIncome = latestAmount('operatingIncome');
    const taxExpense = latestAmount('taxExpense');
    const pretaxIncome = latestAmount('pretaxIncome');

    const investedCapitalOf = (fy: FyLabel): { total: number; text: string } | null => {
      const shortTermDebt = resolve('shortTermDebt', fy);
      const longTermDebt = resolve('longTermDebt', fy);
      const totalEquity = resolve('totalEquity', fy);
      const cashAndEquivalents = resolve('cashAndEquivalents', fy);
      if (
        shortTermDebt === null ||
        longTermDebt === null ||
        totalEquity === null ||
        cashAndEquivalents === null
      ) {
        return null;
      }
      const total = investedCapital({
        shortTermDebt,
        longTermDebt,
        totalEquity,
        cashAndEquivalents
      });
      return {
        total,
        text: `${money(shortTermDebt)} + ${money(longTermDebt)} + ${money(totalEquity)} − ${money(cashAndEquivalents)} = ${money(total)}`
      };
    };

    const closing = investedCapitalOf(latestFy);
    const opening = priorFy === null ? null : investedCapitalOf(priorFy);
    const denominator =
      priorFy === null
        ? (closing?.total ?? null)
        : closing === null || opening === null
          ? null
          : (closing.total + opening.total) / 2;

    const haveIncomeSide = operatingIncome !== null && taxExpense !== null && pretaxIncome !== null;
    const rate = haveIncomeSide ? effectiveTaxRate(taxExpense, pretaxIncome) : null;
    const nopatMinor = haveIncomeSide ? nopat(operatingIncome, taxExpense, pretaxIncome) : null;

    const derivedRows: DerivedFigureRow[] = [];
    if (haveIncomeSide && rate !== null && nopatMinor !== null) {
      derivedRows.push(
        {
          id: 'effectiveTaxRate',
          label: 'Effective tax rate',
          text: taxRateText(money, taxExpense, pretaxIncome, rate)
        },
        {
          id: 'nopat',
          label: 'NOPAT',
          text: `${money(operatingIncome)} × (1 − ${formatPercent(rate)}) = ${money(nopatMinor)}`
        }
      );
    }
    if (closing !== null) {
      derivedRows.push({
        id: 'investedCapitalClosing',
        label: `Invested capital, ${latestFy}`,
        text: closing.text
      });
    }
    if (priorFy !== null && opening !== null) {
      derivedRows.push({
        id: 'investedCapitalOpening',
        label: `Invested capital, ${priorFy}`,
        text: opening.text
      });
      if (closing !== null && denominator !== null) {
        derivedRows.push({
          id: 'averageInvestedCapital',
          label: 'Average invested capital',
          text: `(${money(closing.total)} + ${money(opening.total)}) ÷ 2 = ${money(denominator)}`
        });
      }
    }

    return {
      humanisedFormula: priorFy === null ? labelled : 'NOPAT ÷ average invested capital',
      substituted:
        nopatMinor === null || denominator === null
          ? null
          : `${money(nopatMinor)} ÷ ${money(denominator)} = ${displayed}`,
      priorInputs: priorFy === null ? [] : INVESTED_CAPITAL_ITEMS,
      derivedRows,
      priorFy
    };
  }

  // Every other formula's tokens are line items of the latest year, plus the
  // price and the FCF shorthand. Any unresolvable operand withholds the
  // substituted line entirely: no equation is better than a wrong one.
  let complete = true;
  let equation = replaceTokens(def.formula, (id) => {
    if (!new RegExp(`\\b${id}\\b`).test(def.formula)) return null;
    const minor = latestAmount(id);
    if (minor === null) {
      complete = false;
      return null;
    }
    return amountText(id, minor);
  });

  const derivedRows: DerivedFigureRow[] = [];
  if (/\bFCF\b/.test(def.formula)) {
    const operatingCashFlow = latestAmount('operatingCashFlow');
    const capex = latestAmount('capex');
    if (operatingCashFlow === null || capex === null) {
      complete = false;
    } else {
      // operatingCashFlow − capex: the pinned FCF definition (data-model
      // section 6), stated here so this sheet proves its own numerator.
      const fcfMinor = operatingCashFlow - capex;
      equation = equation.replace(/\bFCF\b/g, money(fcfMinor));
      derivedRows.push({
        id: 'freeCashFlow',
        label: 'Free cash flow',
        text: `${money(operatingCashFlow)} − ${money(capex)} = ${money(fcfMinor)}`
      });
    }
  }

  if (/\bprice\b/.test(def.formula)) {
    if (priceText === null) {
      complete = false;
    } else {
      equation = equation.replace(/\bprice\b/g, priceText);
    }
  }

  return {
    humanisedFormula: labelled,
    substituted: complete ? `${equation} = ${displayed}` : null,
    priorInputs: [],
    derivedRows,
    priorFy: null
  };
}

/**
 * The effective-tax-rate row's arithmetic, honest about the pinned clamp
 * (data-model section 6): taxExpense ÷ pretaxIncome held to [0, 0.45], taken
 * as 0 when pretax income is not positive.
 */
function taxRateText(
  money: (minor: number) => string,
  taxExpense: number,
  pretaxIncome: number,
  rate: number
): string {
  if (pretaxIncome <= 0) return '0% (pretax income at or below zero)';
  const quotient = `${money(taxExpense)} ÷ ${money(pretaxIncome)}`;
  const raw = taxExpense / pretaxIncome;
  if (raw < 0) return `${quotient}, clamped to 0%`;
  if (raw > 0.45) return `${quotient}, clamped to 45.0%`;
  return `${quotient} = ${formatPercent(rate)}`;
}
