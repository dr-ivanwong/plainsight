import { describe, expect, it } from 'vitest';
import {
  companyProfileSchema,
  financialsResponseSchema,
  financialsStatementSchema,
  searchResponseSchema,
  tickerSchema,
  type FinancialsStatement
} from '../src/index.js';

const provenance = {
  source: 'edgar',
  recordedAt: '2026-07-12T09:00:00Z',
  filing: {
    system: 'EDGAR',
    documentId: '0000320193-25-000079',
    url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079.txt'
  },
  mappingVersion: 'edgar-us-gaap-1'
} as const;

const incomeRow = {
  fy: 'FY2025',
  statement: 'income',
  endDate: '2025-09-27',
  currency: 'USD',
  values: { revenue: 39103500000000, netIncome: 9373600000000, dilutedShares: 15408095000 },
  provenance
} satisfies FinancialsStatement;

describe('financials response (backend spec section 2)', () => {
  it('parses a served payload with statements and gaps', () => {
    const balanceRow = {
      ...incomeRow,
      statement: 'balance',
      values: { totalAssets: 36498000000000, totalEquity: 5695000000000 }
    };
    const parsed = financialsResponseSchema.parse({
      ticker: 'AAPL',
      statements: [incomeRow, balanceRow],
      gaps: ['FY2019']
    });
    expect(parsed.statements).toHaveLength(2);
    expect(parsed.gaps).toEqual(['FY2019']);
  });

  it('rejects a value that belongs to a different statement', () => {
    const wrongHome = { ...incomeRow, statement: 'balance' as const };
    const result = financialsStatementSchema.safeParse(wrongHome);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'values.revenue')).toBe(
      true
    );
  });

  it('rejects negative magnitudes on unsigned items and allows them on signed ones', () => {
    const negativeCapex = {
      ...incomeRow,
      statement: 'cashflow' as const,
      values: { operatingCashFlow: 1000, capex: -500 }
    };
    expect(financialsStatementSchema.safeParse(negativeCapex).success).toBe(false);
    const lossYear = { ...incomeRow, values: { revenue: 1000, netIncome: -250 } };
    expect(financialsStatementSchema.safeParse(lossYear).success).toBe(true);
  });

  it('rejects floats and NaN: wire money is integer minor units', () => {
    const float = { ...incomeRow, values: { revenue: 1000.5 } };
    expect(financialsStatementSchema.safeParse(float).success).toBe(false);
    const nan = { ...incomeRow, values: { revenue: Number.NaN } };
    expect(financialsStatementSchema.safeParse(nan).success).toBe(false);
  });

  it('rejects line items outside the pinned dictionary', () => {
    const unknownItem = { ...incomeRow, values: { revenue: 1000, ebitda: 900 } };
    expect(financialsStatementSchema.safeParse(unknownItem).success).toBe(false);
  });

  it('requires the full trust chain in provenance', () => {
    const { mappingVersion: _dropped, ...withoutMapping } = provenance;
    const noMapping = { ...incomeRow, provenance: withoutMapping };
    expect(financialsStatementSchema.safeParse(noMapping).success).toBe(false);
    const { filing: _alsoDropped, ...withoutFiling } = provenance;
    const noFiling = { ...incomeRow, provenance: withoutFiling };
    expect(financialsStatementSchema.safeParse(noFiling).success).toBe(false);
    const manual = { ...incomeRow, provenance: { ...provenance, source: 'manual' } };
    expect(financialsStatementSchema.safeParse(manual).success).toBe(false);
  });

  it('accepts a filing without a url and rejects a malformed one', () => {
    const { url: _dropped, ...filingNoUrl } = provenance.filing;
    const noUrl = { ...incomeRow, provenance: { ...provenance, filing: filingNoUrl } };
    expect(financialsStatementSchema.safeParse(noUrl).success).toBe(true);
    const badUrl = {
      ...incomeRow,
      provenance: { ...provenance, filing: { ...provenance.filing, url: 'not a url' } }
    };
    expect(financialsStatementSchema.safeParse(badUrl).success).toBe(false);
  });

  it('validates gap entries as fiscal-year labels', () => {
    const base = { ticker: 'AAPL', statements: [], gaps: ['2019'] };
    expect(financialsResponseSchema.safeParse(base).success).toBe(false);
    const nonString = { ticker: 'AAPL', statements: [], gaps: [2019] };
    expect(financialsResponseSchema.safeParse(nonString).success).toBe(false);
  });
});

describe('company profile', () => {
  it('parses with and without the optional fields', () => {
    const full = {
      ticker: 'AAPL',
      name: 'Apple Inc.',
      cik: 320193,
      exchange: 'Nasdaq',
      sector: 'Electronic Computers',
      currency: 'USD'
    };
    expect(companyProfileSchema.parse(full).cik).toBe(320193);
    const minimal = { ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, currency: 'USD' };
    expect(companyProfileSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects a non-positive CIK and a malformed currency', () => {
    const zeroCik = { ticker: 'AAPL', name: 'Apple Inc.', cik: 0, currency: 'USD' };
    expect(companyProfileSchema.safeParse(zeroCik).success).toBe(false);
    const badCurrency = { ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, currency: 'usd' };
    expect(companyProfileSchema.safeParse(badCurrency).success).toBe(false);
  });
});

describe('ticker search', () => {
  it('parses a page with an opaque continuation token', () => {
    const page = {
      results: [
        { ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, exchange: 'Nasdaq' },
        { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.', cik: 1067983 }
      ],
      nextPageToken: 'eyJvZmZzZXQiOjJ9'
    };
    expect(searchResponseSchema.parse(page).results).toHaveLength(2);
    const lastPage = { results: [] };
    expect(searchResponseSchema.safeParse(lastPage).success).toBe(true);
  });

  it('rejects an empty-string token: absent means no more pages', () => {
    expect(searchResponseSchema.safeParse({ results: [], nextPageToken: '' }).success).toBe(false);
  });

  it('holds tickers to the exchange shape', () => {
    expect(tickerSchema.safeParse('BRK-B').success).toBe(true);
    expect(tickerSchema.safeParse('BF.B').success).toBe(true);
    expect(tickerSchema.safeParse('aapl').success).toBe(false);
    expect(tickerSchema.safeParse('-X').success).toBe(false);
    expect(tickerSchema.safeParse('').success).toBe(false);
  });
});
