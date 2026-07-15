/**
 * Cochlear Limited (ASX: COH), FY2020 to FY2025, transcribed by hand from the
 * annual reports. The corpus's first Australian-dollar company. All figures
 * in A$ millions exactly as printed to one decimal place; page numbers are
 * the PRINTED page numbers. Odd years from their own report, even years from
 * the following report's comparative column. EPS is printed in CENTS to one
 * decimal place; the EPS note discloses EXACT weighted-average diluted share
 * counts, so the checksum runs at full precision.
 *
 * FY2020 is the corpus's first loss year (the patent litigation expense of
 * 503.7): negative operating income, pretax loss, an income tax benefit
 * entered as negative tax expense, negative operating cash flow, and a
 * diluted loss per share equal to basic (potential shares anti-dilutive).
 *
 * Readings recorded for the owner review pass (see fixtures/README.md):
 * operating income is the face's Results from operating activities line;
 * interest expense is the face's Finance expense, interest line; the debt
 * items are the Loans and borrowings lines only (lease liabilities are
 * presented separately and stay out of debt); capex is the leasehold
 * improvements, plant and equipment (and land and buildings) acquisition
 * line, excluding the IT-system and other-intangible acquisition lines; the
 * cash flows are direct-method with no depreciation line.
 */

export const COH = {
  meta: {
    ticker: 'COH',
    name: 'Cochlear',
    exchange: 'ASX',
    currency: 'AUD',
    valuesDp: 1,
    source: 'ASX-lodged annual reports, transcribed by hand',
    selectionPolicy:
      'Each fiscal year as printed in the annual report that carries it: odd years from their own report, even years from the following report’s comparative column.',
    documents: {
      ar2025: {
        title: 'Cochlear Limited Annual Report 2025',
        url: 'https://announcements.asx.com.au/asxpdf/20250815/pdf/06mwwc8bndj71z.pdf'
      },
      ar2023: {
        title: 'Cochlear Limited Annual Report 2023',
        url: 'https://announcements.asx.com.au/asxpdf/20230815/pdf/05smklwlw4lr8v.pdf'
      },
      ar2021: {
        title: 'Cochlear Limited Annual Report 2021',
        url: 'https://www.annualreports.com/HostedData/AnnualReportArchive/C/ASX_COH_2021.pdf'
      }
    },
    notes: [
      'Operating income is the face’s Results from operating activities line, printed every year; it sits above net finance income or expense, so interest income is excluded from it.',
      'Interest expense is the face’s Finance expense, interest line (Cochlear separates finance income and finance expense on the face).',
      'Short- and long-term debt are the face’s Loans and borrowings lines only: lease liabilities are presented separately and stay out of debt, the same reading as JB Hi-Fi. Years with no loans line are entered as not reported; FY2021’s and FY2023’s current line prints a dash, entered 0. FY2020’s borrowings (393.1 current, 79.9 non-current) funded the patent-litigation settlement and were repaid through FY2021 to FY2023.',
      'Capex is the acquisition of leasehold improvements, plant and equipment and land and buildings line; the separately printed IT-system and other-intangible acquisition lines are excluded, consistent with capex as the property acquisitions line across the corpus.',
      'The cash flows are direct-method in all six years with no depreciation line in the operating section, so depreciationAmortisation stays absent.',
      'FY2020 is a loss year: the patent litigation expense (503.7) drives negative operating income and a pretax loss; the income tax benefit (32.8) is entered as negative tax expense; operating cash flow is negative (the settlement was paid during the year); and the printed diluted loss per share equals basic because potential shares are anti-dilutive. FY2020 also carries the equity raising (institutional placement and share purchase plan, about 1,075.6 combined) in financing.',
      'The EPS note discloses exact weighted-average diluted share counts and the exact net profit, so the checksum needs no disclosure-grain terms.',
      'Net income is net profit (no non-controlling interests in any year); total equity has no non-controlling component, and the balance identity holds exactly in all six years.',
      'The FY2021 report is sourced from the annualreports.com archive mirror (the content is the lodged annual report; the statements and notes were read and verified page for page); the FY2023 and FY2025 reports are the ASX-lodged originals.',
      'The fixture price is synthetic, in Australian dollars (the statements’ currency), chosen so the valuation metrics exercise; not verified market data.'
    ]
  },
  price: {
    amountMinor: 31_000,
    currency: 'AUD',
    asOf: '2026-07-15',
    note: 'Fixture price chosen to exercise the valuation metrics; not verified market data.'
  },
  years: [
    {
      fy: 'FY2020',
      endDate: '2020-06-30',
      document: 'ar2021',
      pages: { income: 79, balance: 81, cashflow: 83, eps: 90 },
      eps: { diluted: -399.6, dp: 1, unit: 'cents' },
      values: {
        revenue: 1320.6,
        costOfRevenue: 344.4,
        grossProfit: 976.2,
        operatingIncome: -262.2,
        interestExpense: 10.5,
        pretaxIncome: -271.1,
        taxExpense: -32.8,
        netIncome: -238.3,
        dilutedShares: 59_634_602,
        cashAndEquivalents: 565.0,
        currentAssets: 1477.5,
        totalAssets: 2575.7,
        currentLiabilities: 817.5,
        shortTermDebt: 393.1,
        longTermDebt: 79.9,
        totalLiabilities: 1174.2,
        totalEquity: 1401.5,
        operatingCashFlow: -157.8,
        capex: 92.9,
        dividendsPaid: 193.7
      }
    },
    {
      fy: 'FY2021',
      endDate: '2021-06-30',
      document: 'ar2021',
      pages: { income: 79, balance: 81, cashflow: 83, eps: 90 },
      eps: { diluted: 496.7, dp: 1, unit: 'cents' },
      values: {
        revenue: 1497.6,
        costOfRevenue: 410.2,
        grossProfit: 1087.4,
        operatingIncome: 374.1,
        interestExpense: 12.0,
        pretaxIncome: 365.7,
        taxExpense: 39.2,
        netIncome: 326.5,
        dilutedShares: 65_734_342,
        cashAndEquivalents: 609.6,
        currentAssets: 1230.0,
        totalAssets: 2438.2,
        currentLiabilities: 402.5,
        shortTermDebt: 0,
        longTermDebt: 45.0,
        totalLiabilities: 736.5,
        totalEquity: 1701.7,
        operatingCashFlow: 271.3,
        capex: 41.2,
        dividendsPaid: 75.6
      }
    },
    {
      fy: 'FY2022',
      endDate: '2022-06-30',
      document: 'ar2023',
      pages: { income: 113, balance: 114, cashflow: 117, eps: 122 },
      eps: { diluted: 439.6, dp: 1, unit: 'cents' },
      values: {
        revenue: 1648.3,
        costOfRevenue: 411.0,
        grossProfit: 1237.3,
        operatingIncome: 400.0,
        interestExpense: 8.6,
        pretaxIncome: 393.8,
        taxExpense: 104.7,
        netIncome: 289.1,
        dilutedShares: 65_770_646,
        cashAndEquivalents: 629.3,
        currentAssets: 1327.0,
        totalAssets: 2465.1,
        currentLiabilities: 527.6,
        shortTermDebt: 42.6,
        longTermDebt: 'nrz',
        totalLiabilities: 779.4,
        totalEquity: 1685.7,
        operatingCashFlow: 376.5,
        capex: 44.5,
        dividendsPaid: 194.0,
        shareRepurchases: 0
      }
    },
    {
      fy: 'FY2023',
      endDate: '2023-06-30',
      document: 'ar2023',
      pages: { income: 113, balance: 114, cashflow: 117, eps: 122 },
      eps: { diluted: 456.1, dp: 1, unit: 'cents' },
      values: {
        revenue: 1936.1,
        costOfRevenue: 488.0,
        grossProfit: 1448.1,
        operatingIncome: 389.5,
        interestExpense: 9.4,
        pretaxIncome: 396.6,
        taxExpense: 96.0,
        netIncome: 300.6,
        dilutedShares: 65_896_853,
        cashAndEquivalents: 555.5,
        currentAssets: 1361.5,
        totalAssets: 2568.7,
        currentLiabilities: 578.0,
        shortTermDebt: 0,
        longTermDebt: 'nrz',
        totalLiabilities: 819.9,
        totalEquity: 1748.8,
        operatingCashFlow: 362.4,
        capex: 50.0,
        dividendsPaid: 197.4,
        shareRepurchases: 29.6
      }
    },
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      document: 'ar2025',
      pages: { income: 128, balance: 129, cashflow: 132, eps: 136 },
      eps: { diluted: 543.0, dp: 1, unit: 'cents' },
      values: {
        revenue: 2235.6,
        costOfRevenue: 562.1,
        grossProfit: 1673.5,
        operatingIncome: 475.0,
        interestExpense: 9.2,
        pretaxIncome: 484.8,
        taxExpense: 128.0,
        netIncome: 356.8,
        dilutedShares: 65_720_649,
        cashAndEquivalents: 513.6,
        currentAssets: 1452.1,
        totalAssets: 2745.1,
        currentLiabilities: 631.5,
        shortTermDebt: 'nrz',
        longTermDebt: 'nrz',
        totalLiabilities: 904.6,
        totalEquity: 1840.5,
        operatingCashFlow: 388.8,
        capex: 62.4,
        dividendsPaid: 245.7,
        shareRepurchases: 43.0
      }
    },
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      document: 'ar2025',
      pages: { income: 128, balance: 129, cashflow: 132, eps: 136 },
      eps: { diluted: 592.8, dp: 1, unit: 'cents' },
      values: {
        revenue: 2343.1,
        costOfRevenue: 615.2,
        grossProfit: 1727.9,
        operatingIncome: 517.8,
        interestExpense: 11.0,
        pretaxIncome: 518.5,
        taxExpense: 129.6,
        netIncome: 388.9,
        dilutedShares: 65_606_224,
        cashAndEquivalents: 275.7,
        currentAssets: 1416.8,
        totalAssets: 2825.0,
        currentLiabilities: 602.3,
        shortTermDebt: 'nrz',
        longTermDebt: 'nrz',
        totalLiabilities: 874.7,
        totalEquity: 1950.3,
        operatingCashFlow: 237.6,
        capex: 62.4,
        dividendsPaid: 278.2,
        shareRepurchases: 28.3
      }
    }
  ]
};
