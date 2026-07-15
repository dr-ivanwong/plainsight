/**
 * CSL Limited (ASX: CSL), FY2016 to FY2025, transcribed by hand from the
 * annual reports (never through the extraction pipeline: this corpus is the
 * yardstick the pipeline is measured against). All figures in US$ millions
 * exactly as printed; page numbers are the PRINTED page numbers. Each year is
 * sourced from the annual report in which it appears, current years from
 * their own report and even years from the following report's comparative
 * column (the FY2016 sourcing was owner-approved 2026-07-15; FY2020's balance
 * column is as restated in the FY2021 report for the Vitaeris acquisition
 * finalisation). The eps checksums are the PRINTED diluted EPS; the builder
 * verifies netIncome ÷ dilutedShares reproduces them at the printed
 * precision, which pins transcription of all three figures together.
 *
 * Readings recorded for the owner review pass (see fixtures/README.md):
 * revenue is the printed Total Operating Revenue line (it includes the other
 * income line); interestExpense is the face's Finance costs line;
 * netIncome is profit attributable to CSL shareholders; totalEquity includes
 * non-controlling interests; the debt items are the face's interest-bearing
 * liabilities lines (lease liabilities included from FY2020 under AASB 16);
 * cash is the balance-sheet line (the cash-flow ending balance nets
 * overdrafts); depreciationAmortisation exists only from FY2020 (earlier
 * cash flows use the direct method).
 */

export const CSL = {
  meta: {
    ticker: 'CSL',
    name: 'CSL',
    exchange: 'ASX',
    currency: 'USD',
    source: 'ASX-lodged annual reports, transcribed by hand',
    selectionPolicy:
      'Each fiscal year as printed in the annual report that carries it: odd years from their own report, even years from the following report’s comparative column.',
    documents: {
      ar2025: {
        title: 'CSL Limited Annual Report 2024/25',
        url: 'https://www.csl.com/-/media/shared/documents/annual-report/csl-annual-report-2025.pdf'
      },
      ar2023: {
        title: 'CSL Limited Annual Report 2022/23',
        url: 'https://www.csl.com/-/media/shared/documents/annual-report/csl-annual-report-2023.pdf'
      },
      ar2021: {
        title: 'CSL Limited Annual Report 2020/21',
        url: 'https://www.asx.com.au/asxpdf/20210903/pdf/45042h2jrs077g.pdf'
      },
      ar2019: {
        title: 'CSL Limited Annual Report 2019',
        url: 'https://www.csl.com/-/media/csl/documents/annual-report-docs/csl-ltd-annual-report-2019-full.pdf'
      },
      ar2017: {
        title: 'CSL Limited Annual Report 2016/17',
        url: 'https://www.csl.com/-/media/csl/documents/annual-report-docs/csl-ltd-annual-report-2017-full.pdf'
      }
    },
    notes: [
      'Revenue is the printed Total Operating Revenue line, the basis on which the filings compute gross profit; it includes the other income line (well under one percent of the total in every year).',
      'Interest expense is the face’s Finance costs line for all ten years: the note’s composition shifts across the decade (lease interest joins under AASB 16 in FY2020, fair-value items in FY2025), while the face line is printed every year; interest coverage is therefore marginally conservative.',
      'Net income is profit attributable to CSL Limited shareholders (non-controlling interests arise from FY2023, CSL Vifor); total equity includes non-controlling interests, the figure on which the balance identity holds, consistent with the US corpus reading.',
      'Short- and long-term debt are the face’s interest-bearing liabilities lines, which include lease liabilities from FY2020 under AASB 16; part of the FY2020 leverage step-up is that presentational change.',
      'Cash is the balance-sheet cash and cash equivalents line; the cash-flow statement’s ending balance nets bank overdrafts and differs in some years.',
      'Depreciation and amortisation appears only from FY2020: earlier cash flows use the direct method with no operating-section line, so the item stays absent for FY2016 to FY2019 (it is contextual and blocks nothing). The FY2020 to FY2023 line is printed as depreciation, amortisation and impairment.',
      'FY2016 is transcribed from the FY2017 report’s restated USD comparative column (owner-approved 2026-07-15): the original FY2016 face prints no operating-profit line and derives gross profit on a sales-revenue basis, while the restated column matches the corpus presentation; CSL adopted USD presentation from FY2016, so all ten years are uniformly USD.',
      'FY2020’s balance column is as restated in the FY2021 report (finalisation of the Vitaeris acquisition accounting); income and cash-flow columns are unrestated.',
      'Dividends paid is the cash-flow line for dividends to CSL Limited shareholders (the only dividends line before FY2023; the non-controlling-interest dividends from FY2023 are excluded).',
      'The fixture price is synthetic, chosen in USD (the statements’ currency) to exercise the valuation metrics; a real AUD market price deliberately renders the valuation metrics as the currency-mismatch state (data-model amendment of 2026-07-15).'
    ]
  },
  price: {
    amountMinor: 15_000,
    currency: 'USD',
    asOf: '2026-07-15',
    note: 'Fixture price chosen to exercise the valuation metrics; not verified market data. In USD deliberately: see the currency-mismatch note.'
  },
  years: [
    {
      fy: 'FY2016',
      endDate: '2016-06-30',
      document: 'ar2017',
      pages: { income: 81, balance: 82, cashflow: 84, eps: 99 },
      eps: { diluted: 2.683, dp: 3 },
      values: {
        revenue: 6115.3,
        costOfRevenue: 3052.8,
        grossProfit: 3062.5,
        operatingIncome: 1437.5,
        interestExpense: 71.6,
        pretaxIncome: 1555.9,
        taxExpense: 313.5,
        netIncome: 1242.4,
        dilutedShares: 463_117_064,
        cashAndEquivalents: 556.6,
        currentAssets: 3818.0,
        totalAssets: 7562.7,
        currentLiabilities: 1374.4,
        shortTermDebt: 62.3,
        longTermDebt: 3081.0,
        totalLiabilities: 4995.5,
        totalEquity: 2567.2,
        operatingCashFlow: 1178.6,
        capex: 495.1,
        dividendsPaid: 579.0,
        shareRepurchases: 648.2
      }
    },
    {
      fy: 'FY2017',
      endDate: '2017-06-30',
      document: 'ar2017',
      pages: { income: 81, balance: 82, cashflow: 84, eps: 99 },
      eps: { diluted: 2.931, dp: 3 },
      values: {
        revenue: 6922.8,
        costOfRevenue: 3326.8,
        grossProfit: 3596.0,
        operatingIncome: 1768.9,
        interestExpense: 90.0,
        pretaxIncome: 1689.8,
        taxExpense: 352.4,
        netIncome: 1337.4,
        dilutedShares: 456_374_648,
        cashAndEquivalents: 844.5,
        currentAssets: 4602.1,
        totalAssets: 9122.7,
        currentLiabilities: 1618.1,
        shortTermDebt: 122.5,
        longTermDebt: 3852.7,
        totalLiabilities: 5958.9,
        totalEquity: 3163.8,
        operatingCashFlow: 1246.6,
        capex: 689.1,
        dividendsPaid: 601.4,
        shareRepurchases: 314.9
      }
    },
    {
      fy: 'FY2018',
      endDate: '2018-06-30',
      document: 'ar2019',
      pages: { income: 88, balance: 89, cashflow: 91, eps: 108 },
      eps: { diluted: 3.809, dp: 3 },
      values: {
        revenue: 7915.3,
        costOfRevenue: 3531.6,
        grossProfit: 4383.7,
        operatingIncome: 2380.3,
        interestExpense: 108.4,
        pretaxIncome: 2281.2,
        taxExpense: 552.3,
        netIncome: 1728.9,
        dilutedShares: 453_876_613,
        cashAndEquivalents: 814.7,
        currentAssets: 4993.7,
        totalAssets: 10774.5,
        currentLiabilities: 1914.7,
        shortTermDebt: 225.7,
        longTermDebt: 4160.6,
        totalLiabilities: 6694.6,
        totalEquity: 4079.9,
        operatingCashFlow: 1902.1,
        capex: 778.8,
        dividendsPaid: 672.2,
        shareRepurchases: 138.4
      }
    },
    {
      fy: 'FY2019',
      endDate: '2019-06-30',
      document: 'ar2019',
      pages: { income: 88, balance: 89, cashflow: 91, eps: 108 },
      eps: { diluted: 4.226, dp: 3 },
      values: {
        revenue: 8538.6,
        costOfRevenue: 3761.2,
        grossProfit: 4777.4,
        operatingIncome: 2504.0,
        interestExpense: 176.7,
        pretaxIncome: 2341.1,
        taxExpense: 422.4,
        netIncome: 1918.7,
        dilutedShares: 454_027_808,
        cashAndEquivalents: 657.8,
        currentAssets: 5540.1,
        totalAssets: 12314.4,
        currentLiabilities: 2188.2,
        shortTermDebt: 420.6,
        longTermDebt: 4242.2,
        totalLiabilities: 7063.1,
        totalEquity: 5251.3,
        operatingCashFlow: 1644.4,
        capex: 1117.6,
        dividendsPaid: 806.8
      }
    },
    {
      fy: 'FY2020',
      endDate: '2020-06-30',
      document: 'ar2021',
      pages: { income: 106, balance: 107, cashflow: 109, eps: 126 },
      eps: { diluted: 4.61, dp: 2 },
      values: {
        revenue: 9150.8,
        costOfRevenue: 3924.4,
        grossProfit: 5226.4,
        operatingIncome: 2716.5,
        interestExpense: 150.8,
        pretaxIncome: 2572.7,
        taxExpense: 470.2,
        netIncome: 2102.5,
        dilutedShares: 455_605_010,
        cashAndEquivalents: 1194.4,
        currentAssets: 6446.2,
        totalAssets: 15615.5,
        currentLiabilities: 2141.5,
        shortTermDebt: 202.3,
        longTermDebt: 5790.5,
        totalLiabilities: 9087.9,
        totalEquity: 6527.6,
        operatingCashFlow: 2488.3,
        capex: 1206.8,
        depreciationAmortisation: 419.8,
        dividendsPaid: 883.1
      }
    },
    {
      fy: 'FY2021',
      endDate: '2021-06-30',
      document: 'ar2021',
      pages: { income: 106, balance: 107, cashflow: 109, eps: 126 },
      eps: { diluted: 5.21, dp: 2 },
      values: {
        revenue: 10310.0,
        costOfRevenue: 4466.7,
        grossProfit: 5843.3,
        operatingIncome: 3130.0,
        interestExpense: 170.8,
        pretaxIncome: 2963.1,
        taxExpense: 588.1,
        netIncome: 2375.0,
        dilutedShares: 456_203_803,
        cashAndEquivalents: 1808.8,
        currentAssets: 7389.7,
        totalAssets: 18156.9,
        currentLiabilities: 3103.6,
        shortTermDebt: 473.8,
        longTermDebt: 5333.1,
        totalLiabilities: 9775.6,
        totalEquity: 8381.3,
        operatingCashFlow: 3621.9,
        capex: 1196.3,
        depreciationAmortisation: 589.6,
        dividendsPaid: 958.0
      }
    },
    {
      fy: 'FY2022',
      endDate: '2022-06-30',
      document: 'ar2023',
      pages: { income: 112, balance: 113, cashflow: 115, eps: 138 },
      eps: { diluted: 4.8, dp: 2 },
      values: {
        revenue: 10562,
        costOfRevenue: 4830,
        grossProfit: 5732,
        operatingIncome: 2927,
        interestExpense: 165,
        pretaxIncome: 2780,
        taxExpense: 525,
        netIncome: 2255,
        dilutedShares: 470_117_188,
        cashAndEquivalents: 10436,
        currentAssets: 16461,
        totalAssets: 28346,
        currentLiabilities: 7108,
        shortTermDebt: 4494,
        longTermDebt: 5165,
        totalLiabilities: 13769,
        totalEquity: 14577,
        operatingCashFlow: 2629,
        capex: 1079,
        depreciationAmortisation: 668,
        dividendsPaid: 1039
      }
    },
    {
      fy: 'FY2023',
      endDate: '2023-06-30',
      document: 'ar2023',
      pages: { income: 112, balance: 113, cashflow: 115, eps: 138 },
      eps: { diluted: 4.53, dp: 2 },
      values: {
        revenue: 13310,
        costOfRevenue: 6466,
        grossProfit: 6844,
        operatingIncome: 3069,
        interestExpense: 444,
        pretaxIncome: 2663,
        taxExpense: 419,
        netIncome: 2194,
        dilutedShares: 483_886_450,
        cashAndEquivalents: 1548,
        currentAssets: 9259,
        totalAssets: 36234,
        currentLiabilities: 4608,
        shortTermDebt: 1055,
        longTermDebt: 11172,
        totalLiabilities: 18408,
        totalEquity: 17826,
        operatingCashFlow: 2601,
        capex: 1228,
        depreciationAmortisation: 831,
        dividendsPaid: 1085
      }
    },
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      document: 'ar2025',
      pages: { income: 90, balance: 91, cashflow: 93, eps: 109 },
      eps: { diluted: 5.45, dp: 2 },
      values: {
        revenue: 14800,
        costOfRevenue: 7129,
        grossProfit: 7671,
        operatingIncome: 3812,
        interestExpense: 476,
        pretaxIncome: 3375,
        taxExpense: 661,
        netIncome: 2642,
        dilutedShares: 485_199_307,
        cashAndEquivalents: 1657,
        currentAssets: 10768,
        totalAssets: 38022,
        currentLiabilities: 4950,
        shortTermDebt: 944,
        longTermDebt: 11239,
        totalLiabilities: 18621,
        totalEquity: 19401,
        operatingCashFlow: 2764,
        capex: 847,
        depreciationAmortisation: 938,
        dividendsPaid: 1192
      }
    },
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      document: 'ar2025',
      pages: { income: 90, balance: 91, cashflow: 93, eps: 109 },
      eps: { diluted: 6.17, dp: 2 },
      values: {
        revenue: 15558,
        costOfRevenue: 7479,
        grossProfit: 8079,
        operatingIncome: 4134,
        interestExpense: 448,
        pretaxIncome: 3724,
        taxExpense: 588,
        netIncome: 3002,
        dilutedShares: 486_220_349,
        cashAndEquivalents: 2157,
        currentAssets: 11850,
        totalAssets: 39404,
        currentLiabilities: 4815,
        shortTermDebt: 804,
        longTermDebt: 10694,
        totalLiabilities: 17997,
        totalEquity: 21407,
        operatingCashFlow: 3561,
        capex: 636,
        depreciationAmortisation: 1017,
        dividendsPaid: 1334
      }
    }
  ]
};
