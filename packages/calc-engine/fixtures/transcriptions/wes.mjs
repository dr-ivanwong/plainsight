/**
 * Wesfarmers Limited (ASX: WES), FY2020 to FY2025, transcribed by hand from
 * the annual reports. All figures in A$ WHOLE millions exactly as printed
 * (valuesDp 0); page numbers are the PRINTED page numbers. Odd years from
 * their own report, even years from the following report's comparative
 * column. EPS is printed in CENTS to one decimal place; the diluted
 * weighted-average share counts are disclosed only in whole millions, so the
 * checksum carries that disclosure grain.
 *
 * Wesfarmers presents expenses by nature with NO cost-of-sales or
 * gross-profit line, so those items stay absent and the gross margin is
 * insufficient-data in every year by design (the Union Pacific precedent,
 * README note 2). The face prints an operating line (Earnings before finance
 * costs and income tax expense) and a depreciation and amortisation expense
 * line, so both are transcribed.
 *
 * Readings recorded for the owner review pass (see fixtures/README.md):
 * interest expense is the SUM of the two printed finance lines (Interest on
 * lease liabilities plus Other finance costs); the debt items are the face's
 * Interest-bearing loans and borrowings lines (leases separate); capex is the
 * combined payments line (property, plant and equipment plus intangibles,
 * and mineral exploration in FY2025); FY2020's income items are the
 * continuing-operations basis as re-presented in the FY2021 report, while
 * net income is total attributable including discontinued operations.
 */

export const WES = {
  meta: {
    ticker: 'WES',
    name: 'Wesfarmers',
    exchange: 'ASX',
    currency: 'AUD',
    valuesDp: 0,
    source: 'ASX-lodged annual reports, transcribed by hand',
    selectionPolicy:
      'Each fiscal year as printed in the annual report that carries it: odd years from their own report, even years from the following report’s comparative column.',
    documents: {
      ar2025: {
        title: 'Wesfarmers 2025 Annual Report',
        url: 'https://www.wesfarmers.com.au/docs/default-source/corporate-governance/2025-annual-report-including-appendix-4e.pdf?sfvrsn=a03ee9bb_3'
      },
      ar2023: {
        title: 'Wesfarmers 2023 Annual Report',
        url: 'https://www.wesfarmers.com.au/docs/default-source/reports/2023-annual-report.pdf?sfvrsn=42fae1bb_8'
      },
      ar2021: {
        title: 'Wesfarmers 2021 Annual Report',
        url: 'https://www.wesfarmers.com.au/docs/default-source/asx-announcements/2021-annual-report-(including-appendix-4e).pdf?sfvrsn=9a1f12bb_0'
      }
    },
    notes: [
      'Wesfarmers presents expenses by nature and prints no cost-of-sales or gross-profit line, so costOfRevenue and grossProfit stay absent and the gross margin reads insufficient-data in every year, the same shape as Union Pacific in the US corpus.',
      'Operating income is the face’s Earnings before finance costs and income tax expense line (it includes other income and the share of associates’ profits, as printed).',
      'Interest expense is the sum of the two printed face lines, Interest on lease liabilities and Other finance costs: the face prints no combined finance-costs total, and both lines are finance costs of the AASB 16 era, so the sum is the conservative coverage reading consistent with the face-line readings elsewhere in the corpus.',
      'Short- and long-term debt are the face’s Interest-bearing loans and borrowings lines only (lease liabilities are presented separately and stay out of debt). FY2023’s current line prints a dash, entered 0; FY2024 and FY2025 print no current line at all, entered as not reported.',
      'Depreciation and amortisation is the income statement’s expense line (expenses by nature); the cash flows are direct-method with no operating depreciation line.',
      'Capex is the printed combined payments line: property, plant and equipment and intangibles (plus mineral exploration from FY2025, following the Covalent lithium consolidation); the filings print no split, so the corpus takes the line as printed.',
      'FY2020’s income items are the continuing-operations basis as re-presented in the FY2021 report’s comparative column; net income is the total attributable to members including the 75 of discontinued-operations profit, and the diluted EPS checksum runs against the total-basis printed EPS (149.9 cents). The balance sheet and cash flow are whole-of-group as filed.',
      'Values are printed in whole millions (valuesDp 0) and the weighted-average diluted share counts in whole millions of shares, so the EPS checksum carries both grains; the FY2021 report prints the dividends line as Equity dividends paid, the later reports as Dividends paid.',
      'Net income is profit attributable to members of the parent; there are no material non-controlling interests, and the balance identity holds exactly in all six years.',
      'The fixture price is synthetic, in Australian dollars (the statements’ currency), chosen so the valuation metrics exercise; not verified market data.'
    ]
  },
  price: {
    amountMinor: 8_500,
    currency: 'AUD',
    asOf: '2026-07-15',
    note: 'Fixture price chosen to exercise the valuation metrics; not verified market data.'
  },
  years: [
    {
      fy: 'FY2020',
      endDate: '2020-06-30',
      document: 'ar2021',
      pages: { income: 124, balance: 126, cashflow: 127, eps: 148 },
      eps: { diluted: 149.9, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 1_000_000,
      values: {
        revenue: 30846,
        operatingIncome: 2744,
        interestExpense: 370,
        pretaxIncome: 2374,
        taxExpense: 752,
        netIncome: 1697,
        dilutedShares: 1_132_000_000,
        cashAndEquivalents: 2913,
        currentAssets: 8064,
        totalAssets: 25425,
        currentLiabilities: 7270,
        shortTermDebt: 503,
        longTermDebt: 2153,
        totalLiabilities: 16081,
        totalEquity: 9344,
        operatingCashFlow: 4546,
        capex: 844,
        depreciationAmortisation: 1528,
        dividendsPaid: 1734
      }
    },
    {
      fy: 'FY2021',
      endDate: '2021-06-30',
      document: 'ar2021',
      pages: { income: 124, balance: 126, cashflow: 127, eps: 148 },
      eps: { diluted: 210.2, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 1_000_000,
      values: {
        revenue: 33941,
        operatingIncome: 3717,
        interestExpense: 344,
        pretaxIncome: 3373,
        taxExpense: 993,
        netIncome: 2380,
        dilutedShares: 1_132_000_000,
        cashAndEquivalents: 3023,
        currentAssets: 9096,
        totalAssets: 26214,
        currentLiabilities: 7915,
        shortTermDebt: 950,
        longTermDebt: 2072,
        totalLiabilities: 16499,
        totalEquity: 9715,
        operatingCashFlow: 3383,
        capex: 843,
        depreciationAmortisation: 1509,
        dividendsPaid: 2074
      }
    },
    {
      fy: 'FY2022',
      endDate: '2022-06-30',
      document: 'ar2023',
      pages: { income: 132, balance: 134, cashflow: 135, eps: 156 },
      eps: { diluted: 207.6, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 1_000_000,
      values: {
        revenue: 36838,
        operatingIncome: 3633,
        interestExpense: 313,
        pretaxIncome: 3320,
        taxExpense: 968,
        netIncome: 2352,
        dilutedShares: 1_133_000_000,
        cashAndEquivalents: 705,
        currentAssets: 9599,
        totalAssets: 27286,
        currentLiabilities: 8908,
        shortTermDebt: 988,
        longTermDebt: 3970,
        totalLiabilities: 19305,
        totalEquity: 7981,
        operatingCashFlow: 2301,
        capex: 1140,
        depreciationAmortisation: 1575,
        dividendsPaid: 1927
      }
    },
    {
      fy: 'FY2023',
      endDate: '2023-06-30',
      document: 'ar2023',
      pages: { income: 132, balance: 134, cashflow: 135, eps: 156 },
      eps: { diluted: 217.6, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 1_000_000,
      values: {
        revenue: 43550,
        operatingIncome: 3863,
        interestExpense: 354,
        pretaxIncome: 3509,
        taxExpense: 1044,
        netIncome: 2465,
        dilutedShares: 1_133_000_000,
        cashAndEquivalents: 673,
        currentAssets: 9154,
        totalAssets: 26546,
        currentLiabilities: 7857,
        shortTermDebt: 0,
        longTermDebt: 4430,
        totalLiabilities: 18265,
        totalEquity: 8281,
        operatingCashFlow: 4179,
        capex: 1286,
        depreciationAmortisation: 1701,
        dividendsPaid: 2132
      }
    },
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      document: 'ar2025',
      pages: { income: 128, balance: 130, cashflow: 131, eps: 152 },
      eps: { diluted: 225.7, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 1_000_000,
      values: {
        revenue: 44189,
        operatingIncome: 3989,
        interestExpense: 402,
        pretaxIncome: 3587,
        taxExpense: 1030,
        netIncome: 2557,
        dilutedShares: 1_133_000_000,
        cashAndEquivalents: 835,
        currentAssets: 9414,
        totalAssets: 27309,
        currentLiabilities: 8213,
        shortTermDebt: 'nrz',
        longTermDebt: 4756,
        totalLiabilities: 18724,
        totalEquity: 8585,
        operatingCashFlow: 4594,
        capex: 1076,
        depreciationAmortisation: 1800,
        dividendsPaid: 2200
      }
    },
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      document: 'ar2025',
      pages: { income: 128, balance: 130, cashflow: 131, eps: 152 },
      eps: { diluted: 258.0, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 1_000_000,
      values: {
        revenue: 45700,
        operatingIncome: 4465,
        interestExpense: 412,
        pretaxIncome: 4053,
        taxExpense: 1127,
        netIncome: 2926,
        dilutedShares: 1_134_000_000,
        cashAndEquivalents: 638,
        currentAssets: 9933,
        totalAssets: 27981,
        currentLiabilities: 8328,
        shortTermDebt: 'nrz',
        longTermDebt: 4719,
        totalLiabilities: 18792,
        totalEquity: 9189,
        operatingCashFlow: 4568,
        capex: 1147,
        depreciationAmortisation: 1833,
        dividendsPaid: 2291
      }
    }
  ]
};
