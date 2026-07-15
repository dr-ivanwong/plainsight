/**
 * JB Hi-Fi Limited (ASX: JBH), FY2020 to FY2025, transcribed by hand from the
 * Appendix 4E and Financial Report lodgements (the annual report proper omits
 * the statements). All figures in A$ millions exactly as printed to one
 * decimal place; page numbers are the PRINTED page numbers. Odd years from
 * their own report, even years from the following report's comparative
 * column. EPS is printed in CENTS to two decimal places; the diluted share
 * denominators are disclosed only to 0.1 million, so the checksum carries the
 * disclosure grain (sharesDisclosedTo).
 *
 * Readings recorded for the owner review pass (see fixtures/README.md):
 * operating income is the directors' report five-year-summary EBIT (no
 * operating-profit line on the face; it reconciles to profit before tax plus
 * finance costs less interest revenue exactly in five of six years and within
 * 0.1m in FY2025); the debt items are the face's Borrowings lines only (lease
 * liabilities are presented separately and stay out of debt); years with no
 * borrowings line are entered not reported (the 'nrz' sentinel), and a
 * printed dash is entered 0; the cash flows are direct-method with no
 * depreciation line, so depreciationAmortisation stays absent.
 */

export const JBH = {
  meta: {
    ticker: 'JBH',
    name: 'JB Hi-Fi',
    exchange: 'ASX',
    currency: 'AUD',
    valuesDp: 1,
    source: 'ASX-lodged Appendix 4E and Financial Reports, transcribed by hand',
    selectionPolicy:
      'Each fiscal year as printed in the financial report that carries it: odd years from their own report, even years from the following report’s comparative column.',
    documents: {
      fr2025: {
        title: 'JB Hi-Fi Limited Appendix 4E and Financial Report 2025',
        url: 'https://assets.ctfassets.net/xa93kvziwaye/5b5OE8DLaDkGbv1BcIyZYA/b7fa8486816253a975c9a19b5a59050e/Appendix_4E_and_Financial_Report_2025_Full_Year.pdf'
      },
      fr2023: {
        title: 'JB Hi-Fi Limited Appendix 4E and Financial Report 2023',
        url: 'https://assets.ctfassets.net/xa93kvziwaye/5VMzeyPDKFn41kQhKQVkXP/f81d1256e3d4961f456e7001465a701e/4E_140823.pdf'
      },
      fr2021: {
        title: 'JB Hi-Fi Limited Appendix 4E and Financial Report 2021',
        url: 'https://assets.ctfassets.net/xa93kvziwaye/Ao5IEwKHxEypJH1ysg4fT/9ae6e1b041539a70cd90489766d6cf8f/Appendix-4E-and-Financial-Report-2021-Full-Year.pdf'
      }
    },
    notes: [
      'Operating income is the group EBIT printed in the directors’ report five-year summary: the statement of profit or loss has no operating-profit line (expenses by function straight to profit before tax). The printed EBIT reconciles to profit before tax plus finance costs less interest revenue exactly in FY2020 to FY2024 and within 0.1m in FY2025 (accrued versus received interest).',
      'Interest expense is the face’s Finance costs line, which includes lease interest under AASB 16 (the cash flow statement splits borrowing interest from lease interest; the face line is their total plus minor items).',
      'Short- and long-term debt are the face’s Borrowings lines only: JB Hi-Fi presents lease liabilities separately from borrowings, and the corpus keeps that split, so leverage reads near-zero debt with the store leases inside total liabilities. Years with no borrowings line on the face (both items in FY2020 and FY2021, one side in the other years as the facility moved between current and non-current) are entered as not reported; FY2025’s current borrowings prints a dash, entered 0.',
      'EPS is printed in cents to two decimal places, and the weighted-average diluted share counts are disclosed only to 0.1 million, so the checksum tolerance carries a full disclosure-grain term: the printed FY2022 diluted denominator (114.2m) is itself a sum of rounded components and reproduces the printed EPS only at that grain.',
      'The cash flows are direct-method in all six years with no depreciation line in the operating section, so depreciationAmortisation stays absent (contextual, blocks nothing).',
      'Share repurchases is the printed off-market buy-back line alone (FY2022, 250.0): the separately printed buy-back transaction costs and the employee-share-trust purchases are excluded. FY2023 prints a dash for the buy-back, entered 0.',
      'Net income is profit attributable to owners of the Company (non-controlling interests first arise in FY2025 from the e&s acquisition); total equity includes non-controlling interests, consistent with the corpus reading, and the balance identity holds exactly in all six years.',
      'The fixture price is synthetic, in Australian dollars (the statements’ currency), chosen so the valuation metrics exercise; not verified market data.'
    ]
  },
  price: {
    amountMinor: 11_000,
    currency: 'AUD',
    asOf: '2026-07-15',
    note: 'Fixture price chosen to exercise the valuation metrics; not verified market data.'
  },
  years: [
    {
      fy: 'FY2020',
      endDate: '2020-06-30',
      document: 'fr2021',
      pages: { income: 61, balance: 63, cashflow: 65, eps: 69, ebit: 36 },
      eps: { diluted: 260.69, dp: 2, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 7918.9,
        costOfRevenue: 6224.8,
        grossProfit: 1694.1,
        operatingIncome: 483.3,
        interestExpense: 36.4,
        pretaxIncome: 448.0,
        taxExpense: 145.7,
        netIncome: 302.3,
        dilutedShares: 116_000_000,
        cashAndEquivalents: 251.5,
        currentAssets: 1245.8,
        totalAssets: 3152.3,
        currentLiabilities: 1345.9,
        shortTermDebt: 'nrz',
        longTermDebt: 'nrz',
        totalLiabilities: 2046.6,
        totalEquity: 1105.7,
        operatingCashFlow: 981.3,
        capex: 43.1,
        dividendsPaid: 172.3
      }
    },
    {
      fy: 'FY2021',
      endDate: '2021-06-30',
      document: 'fr2021',
      pages: { income: 61, balance: 63, cashflow: 65, eps: 69, ebit: 36 },
      eps: { diluted: 437.83, dp: 2, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 8916.1,
        costOfRevenue: 6938.9,
        grossProfit: 1977.2,
        operatingIncome: 743.1,
        interestExpense: 24.7,
        pretaxIncome: 720.0,
        taxExpense: 213.9,
        netIncome: 506.1,
        dilutedShares: 115_600_000,
        cashAndEquivalents: 263.2,
        currentAssets: 1449.3,
        totalAssets: 3255.3,
        currentLiabilities: 1355.3,
        shortTermDebt: 'nrz',
        longTermDebt: 'nrz',
        totalLiabilities: 1946.9,
        totalEquity: 1308.4,
        operatingCashFlow: 558.7,
        capex: 57.7,
        dividendsPaid: 310.2
      }
    },
    {
      fy: 'FY2022',
      endDate: '2022-06-30',
      document: 'fr2023',
      pages: { income: 56, balance: 58, cashflow: 60, eps: 64, ebit: 34 },
      eps: { diluted: 477.45, dp: 2, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 9232.0,
        costOfRevenue: 7151.6,
        grossProfit: 2080.4,
        operatingIncome: 794.6,
        interestExpense: 20.1,
        pretaxIncome: 775.3,
        taxExpense: 230.4,
        netIncome: 544.9,
        dilutedShares: 114_200_000,
        cashAndEquivalents: 125.6,
        currentAssets: 1424.7,
        totalAssets: 3161.4,
        currentLiabilities: 1306.3,
        shortTermDebt: 'nrz',
        longTermDebt: 59.4,
        totalLiabilities: 1881.1,
        totalEquity: 1280.3,
        operatingCashFlow: 627.4,
        capex: 57.6,
        dividendsPaid: 310.2,
        shareRepurchases: 250.0
      }
    },
    {
      fy: 'FY2023',
      endDate: '2023-06-30',
      document: 'fr2023',
      pages: { income: 56, balance: 58, cashflow: 60, eps: 64, ebit: 34 },
      eps: { diluted: 477.91, dp: 2, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 9626.4,
        costOfRevenue: 7443.9,
        grossProfit: 2182.5,
        operatingIncome: 769.0,
        interestExpense: 26.3,
        pretaxIncome: 747.1,
        taxExpense: 222.5,
        netIncome: 524.6,
        dilutedShares: 109_800_000,
        cashAndEquivalents: 177.3,
        currentAssets: 1399.3,
        totalAssets: 3234.9,
        currentLiabilities: 1184.9,
        shortTermDebt: 'nrz',
        longTermDebt: 49.8,
        totalLiabilities: 1815.3,
        totalEquity: 1419.6,
        operatingCashFlow: 716.4,
        capex: 72.0,
        dividendsPaid: 382.7,
        shareRepurchases: 0
      }
    },
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      document: 'fr2025',
      pages: { income: 57, balance: 59, cashflow: 61, eps: 65, ebit: 33 },
      eps: { diluted: 399.67, dp: 2, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 9592.4,
        costOfRevenue: 7452.0,
        grossProfit: 2140.4,
        operatingIncome: 647.2,
        interestExpense: 31.0,
        pretaxIncome: 627.4,
        taxExpense: 188.6,
        netIncome: 438.8,
        dilutedShares: 109_800_000,
        cashAndEquivalents: 317.7,
        currentAssets: 1586.3,
        totalAssets: 3486.6,
        currentLiabilities: 1310.8,
        shortTermDebt: 15.0,
        longTermDebt: 'nrz',
        totalLiabilities: 1927.5,
        totalEquity: 1559.1,
        operatingCashFlow: 752.6,
        capex: 74.5,
        dividendsPaid: 298.5
      }
    },
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      document: 'fr2025',
      pages: { income: 57, balance: 59, cashflow: 61, eps: 65, ebit: 33 },
      eps: { diluted: 421.37, dp: 2, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 10554.8,
        costOfRevenue: 8194.4,
        grossProfit: 2360.4,
        operatingIncome: 694.1,
        interestExpense: 37.7,
        pretaxIncome: 668.0,
        taxExpense: 205.2,
        netIncome: 462.4,
        dilutedShares: 109_700_000,
        cashAndEquivalents: 284.1,
        currentAssets: 1815.6,
        totalAssets: 3882.7,
        currentLiabilities: 1551.0,
        shortTermDebt: 0,
        longTermDebt: 'nrz',
        totalLiabilities: 2260.9,
        totalEquity: 1621.8,
        operatingCashFlow: 711.6,
        capex: 82.3,
        dividendsPaid: 385.9
      }
    }
  ]
};
