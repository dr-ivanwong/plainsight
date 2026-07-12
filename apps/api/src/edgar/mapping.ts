/**
 * The EDGAR standardisation mapping: XBRL us-gaap concepts onto the 22
 * canonical line items (main plan §6 calls this table the crown-jewel asset).
 * Ported from the golden-fixture generator and held to it by the golden tests:
 * mapping the recorded companyfacts documents must reproduce the hand-verified
 * fixtures' line items to integer equality.
 *
 * Two deliberate differences from the generator, both consequences of serving
 * users rather than writing fixtures:
 *
 * 1. The pipeline never asserts the not-reported-zero state. Only the user can
 *    (three-state rule, data-model spec §8), so an undisclosed figure simply
 *    stays absent and surfaces as missing in the client. The fixtures assert
 *    it for Apple's interest expense the way a user would; the mapping must
 *    not, and the golden tests assert the absence.
 * 2. The generator's per-company gross-profit exclusion is generalised into a
 *    per-year consistency rule (see dropInconsistentGrossProfit) rather than
 *    configuration keyed by ticker: a served pipeline cannot carry a hand
 *    list of companies.
 */
import {
  fyLabelFromEndDate,
  fyYear,
  LINE_ITEMS,
  scaleUnitMinor,
  type FyLabel,
  type LineItemId,
  type StatementKind
} from '@plainsight/calc-engine';
import {
  financialsStatementSchema,
  type FinancialsStatement
} from '@plainsight/api-contract';
import { companyfactsSchema, conceptSchema, type EdgarFact } from './companyfacts.js';

/**
 * Versioned with the table (data-model spec §9 provenance): any change to the
 * candidate lists or selection policy bumps this string in the same change.
 */
export const EDGAR_MAPPING_VERSION = 'edgar-us-gaap-1';

interface FirstSpec {
  readonly kind: 'first';
  readonly concepts: readonly string[];
  /** Documents that the corpus shows this item legitimately missing (M1 for a railroad, no-debt filers). Selection is identical either way. */
  readonly optional?: boolean;
  readonly unit?: 'shares';
}

interface SumGroup {
  readonly concepts: readonly string[];
  readonly optional: boolean;
  /** Sum every matching concept in the group instead of taking the first match. */
  readonly sumAll?: boolean;
}

interface SumSpec {
  readonly kind: 'sum';
  readonly groups: readonly SumGroup[];
  /** A single concept that, when reported, is the whole answer and pre-empts the groups. */
  readonly preferSingle?: readonly string[];
  readonly optional?: boolean;
}

type ItemSpec = FirstSpec | SumSpec;

/**
 * Canonical item -> ordered candidate us-gaap concepts ('first' picks the
 * first candidate reporting the period) or a sum of component groups (each
 * group first-match; optional groups contribute nothing when absent).
 * Reviewed against what each golden company actually files; every resolution
 * records the concepts used, so served data stays auditable.
 */
export const EDGAR_MAPPING: Readonly<Record<LineItemId, ItemSpec>> = {
  revenue: {
    kind: 'first',
    concepts: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet'
    ]
  },
  costOfRevenue: {
    kind: 'first',
    concepts: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfSales'],
    optional: true
  },
  grossProfit: { kind: 'first', concepts: ['GrossProfit'], optional: true },
  operatingIncome: { kind: 'first', concepts: ['OperatingIncomeLoss'] },
  interestExpense: {
    kind: 'first',
    concepts: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'],
    optional: true
  },
  pretaxIncome: {
    kind: 'first',
    concepts: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomesticAndForeign'
    ]
  },
  taxExpense: { kind: 'first', concepts: ['IncomeTaxExpenseBenefit'] },
  netIncome: { kind: 'first', concepts: ['NetIncomeLoss'] },
  dilutedShares: {
    kind: 'first',
    concepts: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
    unit: 'shares'
  },
  cashAndEquivalents: {
    kind: 'sum',
    groups: [
      { concepts: ['CashAndCashEquivalentsAtCarryingValue'], optional: false },
      {
        concepts: [
          'ShortTermInvestments',
          'MarketableSecuritiesCurrent',
          'AvailableForSaleSecuritiesCurrent',
          'AvailableForSaleSecuritiesDebtSecuritiesCurrent'
        ],
        optional: true
      }
    ]
  },
  currentAssets: { kind: 'first', concepts: ['AssetsCurrent'] },
  totalAssets: { kind: 'first', concepts: ['Assets'] },
  currentLiabilities: { kind: 'first', concepts: ['LiabilitiesCurrent'] },
  shortTermDebt: {
    kind: 'sum',
    groups: [
      {
        concepts: ['CommercialPaper', 'ShortTermBorrowings', 'OtherShortTermBorrowings'],
        optional: true,
        sumAll: true
      },
      {
        concepts: [
          'LongTermDebtCurrent',
          'LongTermDebtAndCapitalLeaseObligationsCurrent',
          'SecuredDebtCurrent'
        ],
        optional: true
      }
    ],
    preferSingle: ['DebtCurrent'],
    optional: true
  },
  longTermDebt: {
    kind: 'first',
    concepts: [
      'LongTermDebtNoncurrent',
      // Union Pacific tags its "Debt due after one year" line this way before
      // FY2023; the noncurrent-only semantics match (the current portion is
      // tagged separately and lands in shortTermDebt).
      'LongTermDebtAndCapitalLeaseObligations'
    ]
  },
  totalLiabilities: { kind: 'first', concepts: ['Liabilities'] },
  totalEquity: {
    kind: 'first',
    concepts: [
      // Prefer the including-NCI total: it is the figure that makes the
      // balance identity hold within tolerance (assets = liabilities +
      // equity) for filers with noncontrolling interests (Coca-Cola, early
      // Costco). Recorded as an interpretation note in the fixture README.
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
      'StockholdersEquity'
    ]
  },
  operatingCashFlow: {
    kind: 'first',
    concepts: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'
    ]
  },
  capex: {
    kind: 'first',
    concepts: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']
  },
  depreciationAmortisation: {
    kind: 'first',
    concepts: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
      'Depreciation'
    ],
    optional: true
  },
  dividendsPaid: {
    kind: 'first',
    concepts: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
    optional: true
  },
  shareRepurchases: {
    kind: 'first',
    concepts: ['PaymentsForRepurchaseOfCommonStock'],
    optional: true
  }
};

/** Every concept the mapping can consult; the fixture recorder's pruning list is held to this by test. */
export function allCandidateConcepts(): string[] {
  const concepts = new Set<string>();
  for (const spec of Object.values(EDGAR_MAPPING)) {
    if (spec.kind === 'first') {
      for (const concept of spec.concepts) concepts.add(concept);
      continue;
    }
    for (const concept of spec.preferSingle ?? []) concepts.add(concept);
    for (const group of spec.groups) {
      for (const concept of group.concepts) concepts.add(concept);
    }
  }
  return [...concepts].sort();
}

/**
 * Income and cash flow items are duration facts (a full fiscal year, 300 to
 * 400 days: 52/53-week retail calendars pass, quarters cannot); balance items
 * are instants. Derived from statement membership so the two tables cannot
 * drift.
 */
const isDurationItem = (id: LineItemId): boolean => LINE_ITEMS[id].statement !== 'balance';

const DAY_MS = 86_400_000;
const dayspan = (start: string, end: string): number => (Date.parse(end) - Date.parse(start)) / DAY_MS;

/**
 * All annual facts for one concept, keyed by period end date, taking the value
 * from the EARLIEST 10-K that reported the period (the as-originally-reported
 * policy: later restatements and comparative re-presentations never overwrite
 * what the year's own filing said). 10-K/A amendments are used only where no
 * original 10-K carries the period.
 */
function annualFactsByEnd(
  concept: unknown,
  opts: { duration: boolean; unit: string }
): Map<string, EdgarFact> {
  const byEnd = new Map<string, EdgarFact>();
  if (concept === undefined) return byEnd;
  const units = conceptSchema.parse(concept).units[opts.unit];
  if (units === undefined) return byEnd;
  const rank = (fact: EdgarFact): string => `${fact.form === '10-K' ? 0 : 1}:${fact.filed}`;
  for (const fact of units) {
    if (fact.form !== '10-K' && fact.form !== '10-K/A') continue;
    if (opts.duration) {
      if (fact.start === undefined) continue;
      const days = dayspan(fact.start, fact.end);
      if (days < 300 || days > 400) continue;
    } else if (fact.start !== undefined) {
      continue;
    }
    const existing = byEnd.get(fact.end);
    if (existing === undefined || rank(fact) < rank(existing)) byEnd.set(fact.end, fact);
  }
  return byEnd;
}

/** A resolved value for one item in one year, with its audit trail. */
export interface MappedItem {
  amountMinor: number;
  /** The us-gaap concepts that produced the value (more than one for summed items). */
  concepts: readonly string[];
  /** Accession number of the filing the (first) fact came from. */
  accession: string;
}

export interface MappedYear {
  fy: FyLabel;
  endDate: string;
  currency: 'USD';
  items: Partial<Record<LineItemId, MappedItem>>;
}

export interface MappedCompanyfacts {
  cik: number;
  entityName: string;
  /** Every annual period the document supports, ascending by label; callers take the years they serve. */
  years: MappedYear[];
}

type ConceptIndex = (concept: string, unit: string, duration: boolean) => Map<string, EdgarFact>;

function indexOf(usGaap: Readonly<Record<string, unknown>>): ConceptIndex {
  const memo = new Map<string, Map<string, EdgarFact>>();
  return (concept, unit, duration) => {
    const key = `${concept} ${unit} ${duration ? 'd' : 'i'}`;
    let entry = memo.get(key);
    if (entry === undefined) {
      entry = annualFactsByEnd(usGaap[concept], { duration, unit });
      memo.set(key, entry);
    }
    return entry;
  };
}

interface Resolution {
  valueUsd: number;
  concepts: string[];
  accession: string;
}

function resolveFirst(
  index: ConceptIndex,
  concepts: readonly string[],
  end: string,
  unit: string,
  duration: boolean
): Resolution | null {
  for (const concept of concepts) {
    const fact = index(concept, unit, duration).get(end);
    if (fact !== undefined) return { valueUsd: fact.val, concepts: [concept], accession: fact.accn };
  }
  return null;
}

function resolveItem(
  index: ConceptIndex,
  itemId: LineItemId,
  spec: ItemSpec,
  end: string
): Resolution | null {
  const duration = isDurationItem(itemId);
  if (spec.kind === 'first') {
    return resolveFirst(index, spec.concepts, end, spec.unit ?? 'USD', duration);
  }

  // 'sum' spec, with an optional single-concept preference.
  if (spec.preferSingle) {
    const single = resolveFirst(index, spec.preferSingle, end, 'USD', duration);
    if (single !== null) return single;
  }
  let total = 0;
  const used: string[] = [];
  let accession: string | null = null;
  let anyFound = false;
  for (const group of spec.groups) {
    if (group.sumAll) {
      for (const concept of group.concepts) {
        const fact = index(concept, 'USD', duration).get(end);
        if (fact !== undefined) {
          total += fact.val;
          used.push(concept);
          accession ??= fact.accn;
          anyFound = true;
        }
      }
      continue;
    }
    const resolved = resolveFirst(index, group.concepts, end, 'USD', duration);
    if (resolved !== null) {
      total += resolved.valueUsd;
      used.push(...resolved.concepts);
      accession ??= resolved.accession;
      anyFound = true;
    } else if (!group.optional) {
      return null;
    }
  }
  if (!anyFound || accession === null) return null;
  return { valueUsd: total, concepts: used, accession };
}

/**
 * Dollars to integer minor units; a fact that is not a clean cent amount is a
 * data defect worth failing loudly on. (The generator's version of this check
 * compared against the rounded value with a half-cent slack, which rounding
 * can never exceed, so it could never fire; this one implements the intent.
 * The 0.01-cent slack absorbs float representation error, which stays far
 * below it for any magnitude a filing can reach.)
 */
export function toMinor(valueUsd: number, context: string): number {
  const scaled = valueUsd * 100;
  const minor = Math.round(scaled);
  if (Math.abs(scaled - minor) > 0.01) {
    throw new Error(`${context}: value ${valueUsd} is not a clean cent amount`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`${context}: ${valueUsd} exceeds safe integer minor units`);
  }
  return minor;
}

/**
 * The one place the mapping drops an as-reported figure: a GrossProfit tag
 * disagreeing with revenue minus costOfRevenue beyond the pinned tolerance
 * (data-model spec §4) is excluded for that year, keeping gross margin on the
 * derived, internally consistent basis. The real case: Costco's FY2019 filing
 * carries a one-off GrossProfit on a net-sales basis (membership fees sit
 * inside total revenue but outside net sales), 3,352 USD million away from
 * the derivation; the entry screen would warn a user about the same identity,
 * and a pipeline with no user to ask prefers consistency. The tolerance's
 * scale-unit floor assumes millions, the print scale of EDGAR large caps.
 * Gross profit is a derived-role item, so dropping it blocks nothing.
 */
function dropInconsistentGrossProfit(items: Partial<Record<LineItemId, MappedItem>>): void {
  const grossProfit = items.grossProfit;
  const revenue = items.revenue;
  const costOfRevenue = items.costOfRevenue;
  if (grossProfit === undefined || revenue === undefined || costOfRevenue === undefined) return;
  const derived = revenue.amountMinor - costOfRevenue.amountMinor;
  const diff = Math.abs(grossProfit.amountMinor - derived);
  const tolerance = Math.max(
    3 * scaleUnitMinor('millions'),
    0.001 * Math.max(Math.abs(grossProfit.amountMinor), Math.abs(derived))
  );
  if (diff > tolerance) delete items.grossProfit;
}

/**
 * Maps a companyfacts document onto canonical line items for every annual
 * period it supports. Fiscal years are anchored on the net-income annual
 * durations (a year the income statement cannot anchor is not a servable
 * year), labelled per the fiscal-calendar policy (data-model spec §4). When a
 * fiscal-year-end change puts two annual periods in one calendar year, the
 * later period carries the label.
 */
export function mapCompanyfacts(document: unknown): MappedCompanyfacts {
  const parsed = companyfactsSchema.parse(document);
  const usGaap = parsed.facts['us-gaap'];
  if (usGaap === undefined) {
    throw new Error(`companyfacts for CIK ${parsed.cik}: no us-gaap facts`);
  }
  const index = indexOf(usGaap);

  const anchorSpec = EDGAR_MAPPING.netIncome;
  const anchorEnds = new Set<string>();
  if (anchorSpec.kind === 'first') {
    for (const concept of anchorSpec.concepts) {
      for (const end of index(concept, 'USD', true).keys()) anchorEnds.add(end);
    }
  }

  const byLabel = new Map<FyLabel, MappedYear>();
  for (const end of [...anchorEnds].sort()) {
    const items: Partial<Record<LineItemId, MappedItem>> = {};
    for (const [itemId, spec] of Object.entries(EDGAR_MAPPING) as [LineItemId, ItemSpec][]) {
      const resolved = resolveItem(index, itemId, spec, end);
      if (resolved === null) continue;
      const amountMinor =
        itemId === 'dilutedShares'
          ? Math.round(resolved.valueUsd)
          : toMinor(resolved.valueUsd, `${end} ${itemId}`);
      items[itemId] = {
        amountMinor,
        concepts: resolved.concepts,
        accession: resolved.accession
      };
    }
    dropInconsistentGrossProfit(items);
    const fy = fyLabelFromEndDate(end);
    // Ascending iteration makes the later end win a label collision.
    byLabel.set(fy, { fy, endDate: end, currency: 'USD', items });
  }

  const years = [...byLabel.values()].sort((a, b) => fyYear(a.fy) - fyYear(b.fy));
  return { cik: parsed.cik, entityName: parsed.entityName, years };
}

/** The browsable filing directory for an accession; powers tap-to-see-source on served rows. */
export function edgarFilingUrl(cik: number, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll('-', '')}/`;
}

/**
 * Splits a mapped year into per-statement wire rows (the DynamoDB and API
 * grain), each carrying full provenance: filing reference, mapping version,
 * and recording time. The filing reference is the accession that supplied the
 * most items on the row (ties broken lexicographically), which is the year's
 * own 10-K in every ordinary case.
 */
export function toStatementRows(
  year: MappedYear,
  opts: { cik: number; recordedAt: string }
): FinancialsStatement[] {
  const rows: FinancialsStatement[] = [];
  for (const statement of ['income', 'balance', 'cashflow'] as StatementKind[]) {
    const entries = (Object.entries(year.items) as [LineItemId, MappedItem][]).filter(
      ([id]) => LINE_ITEMS[id].statement === statement
    );
    if (entries.length === 0) continue;
    const values = Object.fromEntries(entries.map(([id, item]) => [id, item.amountMinor]));
    const tally = new Map<string, number>();
    for (const [, item] of entries) {
      tally.set(item.accession, (tally.get(item.accession) ?? 0) + 1);
    }
    const documentId = [...tally.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0]?.[0] as string;
    rows.push(
      financialsStatementSchema.parse({
        fy: year.fy,
        statement,
        endDate: year.endDate,
        currency: year.currency,
        values,
        provenance: {
          source: 'edgar',
          recordedAt: opts.recordedAt,
          filing: {
            system: 'EDGAR',
            documentId,
            url: edgarFilingUrl(opts.cik, documentId)
          },
          mappingVersion: EDGAR_MAPPING_VERSION
        }
      })
    );
  }
  return rows;
}
