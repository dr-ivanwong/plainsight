/**
 * Woolworths Group Limited (ASX: WOW), FY2020 to FY2025, transcribed by hand
 * from the annual reports. All figures in A$ WHOLE millions exactly as
 * printed (valuesDp 0); page numbers are the PRINTED page numbers. Odd years
 * from their own report, even years from the following report's comparative
 * column. Woolworths reports on a 52/53-week retail calendar, so the end
 * dates below are the exact period ends printed in the statement headings
 * (FY2024 is the 53-week year).
 *
 * The Endeavour Group demerger shapes two years. FY2021 presents Endeavour
 * as discontinued operations held for distribution: the income face is the
 * continuing basis, net income is total attributable including the 468 of
 * discontinued profit, and the balance sheet carries Endeavour inside assets
 * and liabilities held for distribution with the 7,870 demerger distribution
 * already deducted from equity. FY2022 (from the FY2023 report's comparative)
 * carries the 6,387 demerger gain in discontinued operations, so net income
 * is 7,934 and the printed total-basis diluted EPS is 644.8 cents.
 *
 * Readings recorded for the owner review pass (see fixtures/README.md):
 * interest expense is the face's Net finance costs line (labelled Finance
 * costs in the FY2021 report); the debt items are the face's Borrowings
 * lines (leases separate); the FY2022 comparative is as reclassified in the
 * FY2023 report (2,071 moved from branch and administration expenses into
 * cost of sales); FY2020's restated-comparative EPS carries a documented
 * print slack because the filing's own printed figures do not reconcile.
 */

export const WOW = {
  meta: {
    ticker: 'WOW',
    name: 'Woolworths',
    exchange: 'ASX',
    currency: 'AUD',
    valuesDp: 0,
    source: 'ASX-lodged annual reports, transcribed by hand',
    selectionPolicy:
      'Each fiscal year as printed in the annual report that carries it: odd years from their own report, even years from the following report’s comparative column.',
    documents: {
      ar2025: {
        title: 'Woolworths Group Annual Report 2025',
        url: 'https://www.woolworthsgroup.com.au/content/dam/wwg/sustainability/reports/f25/Woolworths%20Group%20Annual%20Report%202025%20.pdf'
      },
      ar2023: {
        title: 'Woolworths Group 2023 Annual Report',
        url: 'https://www.woolworthsgroup.com.au/content/dam/wwg/investors/reports/2023/f23-full-year/Woolworths%20Group%202023%20Annual%20Report.pdf'
      },
      ar2021: {
        title: 'Woolworths Group Annual Report 2021',
        url: 'https://www.woolworthsgroup.com.au/content/dam/wwg/investors/reports/2021/195984_annual-report-2021.pdf'
      }
    },
    notes: [
      'Woolworths reports on a 52/53-week retail calendar: each end date is the exact period end printed in the statement heading, and FY2024 is a 53-week period (ended 2024-06-30), which flatters its year-on-year comparisons by about a week of trading.',
      'Interest expense is the face’s Net finance costs line (printed as Finance costs in the FY2021 report): Woolworths nets finance income against finance costs on the face, so coverage is marginally flattered relative to a gross reading; the note behind it splits the components.',
      'Short- and long-term debt are the face’s Borrowings lines only (lease liabilities are presented separately and stay out of debt, the same reading as the other ASX retailers).',
      'FY2021 is the Endeavour demerger year: the income face is the continuing basis, net income is total attributable to equity holders (2,074, including 468 of discontinued-operations profit); the balance sheet holds Endeavour inside assets held for sale or distribution (10,959) and the matching liabilities (5,231), with the 7,870 demerger distribution already deducted from equity, which is why total equity steps down to 1,739; and the operating cash flow and capex include Endeavour for the full period. Cash is the balance-sheet line (1,009); the cash-flow ending balance (1,446) includes Endeavour’s cash held for distribution.',
      'FY2022 net income (7,934 attributable) includes the 6,387 demerger gain inside discontinued operations, and the checksum runs against the printed total-basis diluted EPS (644.8 cents). The return-on-equity spike this produces, and the leverage-flattered-returns flag the corpus expects over FY2022 to FY2025, are the rules reading real statements, recorded as items to investigate.',
      'FY2022’s income items are as reclassified in the FY2023 report’s comparative column (2,071 moved from branch and administration expenses into cost of sales; the originally filed gross profit was 18,042, the re-presented figure 15,971), consistent with the even-years-from-the-following-report sourcing rule.',
      'FY2020 is the restated comparative in the FY2021 report (the salaried team member remediation): its printed EPS figures do not reconcile with the note’s own printed net income and share counts at print precision (all four FY2020 EPS figures sit about 0.13 to 0.16 cents above the recomputation), so the year carries an explicit eps.printSlack of 0.1 cents, recorded here rather than hidden in a wider general tolerance.',
      'Net income is profit attributable to equity holders of the parent entity; total equity includes non-controlling interests, and the balance identity holds exactly in all six years. Dividends paid is the cash-flow line for parent-entity dividends (the dividend reinvestment plan makes cash dividends smaller than declared dividends; non-controlling-interest dividends are excluded).',
      'Cost of sales and gross profit print on the face in every year, and the cash flows are direct-method with no depreciation line, so depreciationAmortisation stays absent.',
      'The fixture price is synthetic, in Australian dollars (the statements’ currency), chosen so the valuation metrics exercise; not verified market data.'
    ]
  },
  price: {
    amountMinor: 3_100,
    currency: 'AUD',
    asOf: '2026-07-15',
    note: 'Fixture price chosen to exercise the valuation metrics; not verified market data.'
  },
  years: [
    {
      fy: 'FY2020',
      endDate: '2020-06-28',
      document: 'ar2021',
      pages: { income: 78, balance: 80, cashflow: 82, eps: 113 },
      eps: {
        diluted: 92.2,
        dp: 1,
        unit: 'cents',
        printSlack: 0.1,
        slackNote:
          'Restated comparative: the printed EPS figures sit about 0.13 cents above the recomputation from the note’s own printed net income and diluted share count; see the FY2020 interpretation note.'
      },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 53080,
        costOfRevenue: 37750,
        grossProfit: 15330,
        operatingIncome: 2026,
        interestExpense: 671,
        pretaxIncome: 1355,
        taxExpense: 417,
        netIncome: 1165,
        dilutedShares: 1_265_400_000,
        cashAndEquivalents: 2068,
        currentAssets: 8125,
        totalAssets: 38472,
        currentLiabilities: 13457,
        shortTermDebt: 2027,
        longTermDebt: 1904,
        totalLiabilities: 29440,
        totalEquity: 9032,
        operatingCashFlow: 4561,
        capex: 2149,
        dividendsPaid: 1133
      }
    },
    {
      fy: 'FY2021',
      endDate: '2021-06-27',
      document: 'ar2021',
      pages: { income: 78, balance: 80, cashflow: 82, eps: 113 },
      eps: { diluted: 164.2, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 55694,
        costOfRevenue: 39366,
        grossProfit: 16328,
        operatingIncome: 2823,
        interestExpense: 613,
        pretaxIncome: 2210,
        taxExpense: 604,
        netIncome: 2074,
        dilutedShares: 1_262_600_000,
        cashAndEquivalents: 1009,
        currentAssets: 15786,
        totalAssets: 39236,
        currentLiabilities: 23117,
        shortTermDebt: 119,
        longTermDebt: 2753,
        totalLiabilities: 37497,
        totalEquity: 1739,
        operatingCashFlow: 4624,
        capex: 2389,
        dividendsPaid: 1104
      }
    },
    {
      fy: 'FY2022',
      endDate: '2022-06-26',
      document: 'ar2023',
      pages: { income: 102, balance: 104, cashflow: 106, eps: 142 },
      eps: { diluted: 644.8, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 60849,
        costOfRevenue: 44878,
        grossProfit: 15971,
        operatingIncome: 2691,
        interestExpense: 600,
        pretaxIncome: 2091,
        taxExpense: 534,
        netIncome: 7934,
        dilutedShares: 1_230_300_000,
        cashAndEquivalents: 1032,
        currentAssets: 6110,
        totalAssets: 33273,
        currentLiabilities: 10750,
        shortTermDebt: 354,
        longTermDebt: 3938,
        totalLiabilities: 27169,
        totalEquity: 6104,
        operatingCashFlow: 3378,
        capex: 2416,
        dividendsPaid: 1007,
        shareRepurchases: 2000
      }
    },
    {
      fy: 'FY2023',
      endDate: '2023-06-25',
      document: 'ar2023',
      pages: { income: 102, balance: 104, cashflow: 106, eps: 142 },
      eps: { diluted: 132.3, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 64294,
        costOfRevenue: 47118,
        grossProfit: 17176,
        operatingIncome: 2999,
        interestExpense: 677,
        pretaxIncome: 2322,
        taxExpense: 693,
        netIncome: 1618,
        dilutedShares: 1_223_100_000,
        cashAndEquivalents: 1135,
        currentAssets: 6375,
        totalAssets: 33648,
        currentLiabilities: 11886,
        shortTermDebt: 466,
        longTermDebt: 3289,
        totalLiabilities: 27083,
        totalEquity: 6565,
        operatingCashFlow: 4754,
        capex: 2519,
        dividendsPaid: 1026,
        shareRepurchases: 0
      }
    },
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      document: 'ar2025',
      pages: { income: 106, balance: 108, cashflow: 110, eps: 136 },
      eps: { diluted: 8.9, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 67922,
        costOfRevenue: 49370,
        grossProfit: 18552,
        operatingIncome: 1616,
        interestExpense: 740,
        pretaxIncome: 876,
        taxExpense: 759,
        netIncome: 108,
        dilutedShares: 1_225_700_000,
        cashAndEquivalents: 1298,
        currentAssets: 6991,
        totalAssets: 33936,
        currentLiabilities: 12819,
        shortTermDebt: 712,
        longTermDebt: 3866,
        totalLiabilities: 28366,
        totalEquity: 5570,
        operatingCashFlow: 4359,
        capex: 2548,
        dividendsPaid: 1172
      }
    },
    {
      fy: 'FY2025',
      endDate: '2025-06-29',
      document: 'ar2025',
      pages: { income: 106, balance: 108, cashflow: 110, eps: 136 },
      eps: { diluted: 78.4, dp: 1, unit: 'cents' },
      sharesDisclosedTo: 100_000,
      values: {
        revenue: 69077,
        costOfRevenue: 50262,
        grossProfit: 18815,
        operatingIncome: 2185,
        interestExpense: 811,
        pretaxIncome: 1374,
        taxExpense: 421,
        netIncome: 963,
        dilutedShares: 1_228_700_000,
        cashAndEquivalents: 1275,
        currentAssets: 6991,
        totalAssets: 33829,
        currentLiabilities: 12297,
        shortTermDebt: 244,
        longTermDebt: 5267,
        totalLiabilities: 28867,
        totalEquity: 4962,
        operatingCashFlow: 4550,
        capex: 2528,
        dividendsPaid: 1661
      }
    }
  ]
};
