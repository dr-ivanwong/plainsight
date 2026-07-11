/**
 * Canonical line items, transcribed from docs/plan/plainsight-data-model.md section 2.
 * 22 items across three statements. This module is the single in-code source for
 * item metadata: statement membership, completeness role, P-0 sign class, and the
 * "find it as" hints rendered inline on the data-entry screen (S5).
 */

export type StatementKind = 'income' | 'balance' | 'cashflow';

/**
 * Completeness role (spec section 2):
 * - core: required for statement completeness (entered or asserted not-reported-zero).
 * - derived: computable from other items; never blocks completeness (P-8).
 * - contextual: enriches detail sheets and validation; blocks nothing.
 */
export type LineItemRole = 'core' | 'derived' | 'contextual';

export const LINE_ITEM_IDS = [
  // Income statement
  'revenue',
  'costOfRevenue',
  'grossProfit',
  'operatingIncome',
  'interestExpense',
  'pretaxIncome',
  'taxExpense',
  'netIncome',
  'dilutedShares',
  // Balance sheet
  'cashAndEquivalents',
  'currentAssets',
  'totalAssets',
  'currentLiabilities',
  'shortTermDebt',
  'longTermDebt',
  'totalLiabilities',
  'totalEquity',
  // Cash flow statement
  'operatingCashFlow',
  'capex',
  'depreciationAmortisation',
  'dividendsPaid',
  'shareRepurchases'
] as const;

export type LineItemId = (typeof LINE_ITEM_IDS)[number];

export interface LineItemMeta {
  readonly id: LineItemId;
  readonly statement: StatementKind;
  readonly label: string;
  /** The S5 inline hint, verbatim from the spec's "Find it as" column. */
  readonly findItAs: string;
  readonly role: LineItemRole;
  /**
   * P-0 sign class: true for the signed exceptions that may be negative.
   * Everything else is stored as a positive magnitude with fixed semantic direction.
   */
  readonly signed: boolean;
  /**
   * Items the spec marks as legitimately assertable to not-reported-zero
   * (the two debt lines and interest expense). The mechanism is general (any
   * field's overflow menu offers it, frontend spec S5); this flag records the
   * cases the spec calls out as expected.
   */
  readonly zeroAssertable: boolean;
}

const item = (
  id: LineItemId,
  statement: StatementKind,
  label: string,
  findItAs: string,
  role: LineItemRole,
  opts: { signed?: boolean; zeroAssertable?: boolean } = {}
): LineItemMeta => ({
  id,
  statement,
  label,
  findItAs,
  role,
  signed: opts.signed ?? false,
  zeroAssertable: opts.zeroAssertable ?? false
});

export const LINE_ITEMS: Readonly<Record<LineItemId, LineItemMeta>> = {
  revenue: item(
    'revenue',
    'income',
    'Revenue',
    "'Total revenue' / 'Net sales', first line of the income statement",
    'core'
  ),
  costOfRevenue: item(
    'costOfRevenue',
    'income',
    'Cost of revenue',
    "'Cost of sales' / 'Cost of revenue' / 'Cost of goods sold'",
    'core'
  ),
  grossProfit: item(
    'grossProfit',
    'income',
    'Gross profit',
    "'Gross profit' / 'Gross margin'; derived as revenue minus cost of revenue when the filing omits it",
    'derived',
    { signed: true }
  ),
  operatingIncome: item(
    'operatingIncome',
    'income',
    'Operating income',
    "'Operating income' / 'Income from operations'; IFRS: 'Profit from operations' / 'EBIT'",
    'core',
    { signed: true }
  ),
  interestExpense: item(
    'interestExpense',
    'income',
    'Interest expense',
    "'Interest expense'; IFRS: within 'Finance costs'",
    'core',
    { zeroAssertable: true }
  ),
  pretaxIncome: item(
    'pretaxIncome',
    'income',
    'Pre-tax income',
    "'Income before income taxes'; IFRS: 'Profit before tax'",
    'core',
    { signed: true }
  ),
  taxExpense: item(
    'taxExpense',
    'income',
    'Income tax expense',
    "'Provision for income taxes' / 'Income tax expense' (negative in benefit years)",
    'core',
    { signed: true }
  ),
  netIncome: item(
    'netIncome',
    'income',
    'Net income',
    "'Net income'; IFRS: 'Profit for the year attributable to owners of the parent'",
    'core',
    { signed: true }
  ),
  dilutedShares: item(
    'dilutedShares',
    'income',
    'Diluted shares',
    "'Weighted-average diluted shares outstanding', near EPS",
    'core'
  ),
  cashAndEquivalents: item(
    'cashAndEquivalents',
    'balance',
    'Cash & equivalents',
    "'Cash and cash equivalents' plus 'Short-term investments' / 'marketable securities' where listed separately",
    'core'
  ),
  currentAssets: item('currentAssets', 'balance', 'Current assets', "'Total current assets'", 'core'),
  totalAssets: item('totalAssets', 'balance', 'Total assets', "'Total assets'", 'core'),
  currentLiabilities: item(
    'currentLiabilities',
    'balance',
    'Current liabilities',
    "'Total current liabilities'",
    'core'
  ),
  shortTermDebt: item(
    'shortTermDebt',
    'balance',
    'Short-term debt',
    "'Short-term borrowings' plus 'Current portion of long-term debt'",
    'core',
    { zeroAssertable: true }
  ),
  longTermDebt: item(
    'longTermDebt',
    'balance',
    'Long-term debt',
    "'Long-term debt'; IFRS: non-current 'Borrowings'",
    'core',
    { zeroAssertable: true }
  ),
  totalLiabilities: item(
    'totalLiabilities',
    'balance',
    'Total liabilities',
    "'Total liabilities' (feeds the balance gate: assets = liabilities + equity)",
    'core'
  ),
  totalEquity: item(
    'totalEquity',
    'balance',
    'Total equity',
    "'Total stockholders' equity'; IFRS: 'Equity attributable to owners of the parent'",
    'core',
    { signed: true }
  ),
  operatingCashFlow: item(
    'operatingCashFlow',
    'cashflow',
    'Operating cash flow',
    "'Net cash provided by operating activities'",
    'core',
    { signed: true }
  ),
  capex: item(
    'capex',
    'cashflow',
    'Capital expenditure',
    "'Purchases of property, plant and equipment' (entered positive; it is an outflow by definition)",
    'core'
  ),
  depreciationAmortisation: item(
    'depreciationAmortisation',
    'cashflow',
    'D&A',
    "'Depreciation and amortisation' in the operating section",
    'contextual'
  ),
  dividendsPaid: item(
    'dividendsPaid',
    'cashflow',
    'Dividends paid',
    "'Dividends paid' in the financing section",
    'contextual'
  ),
  shareRepurchases: item(
    'shareRepurchases',
    'cashflow',
    'Buybacks',
    "'Repurchases of common stock' / 'Payments for share buy-back'",
    'contextual'
  )
} as const;

export const STATEMENT_KINDS: readonly StatementKind[] = ['income', 'balance', 'cashflow'];

/** Core items per statement: these define statement completeness (spec section 10). */
export function coreItemsFor(statement: StatementKind): LineItemId[] {
  return LINE_ITEM_IDS.filter(
    (id) => LINE_ITEMS[id].statement === statement && LINE_ITEMS[id].role === 'core'
  );
}
