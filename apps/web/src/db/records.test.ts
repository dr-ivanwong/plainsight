import { RULE_IDS } from '@plainsight/calc-engine';
import { describe, expect, it } from 'vitest';
import {
  company,
  credential,
  dismissal,
  incomeStatement,
  price,
  thesis,
  thesisVersion,
  T0
} from '../test/builders';
import {
  companyRecordSchema,
  flagDismissalRecordSchema,
  metaRecordSchema,
  priceRecordSchema,
  providerCredentialRecordSchema,
  quarantineRecordSchema,
  statementRecordSchema,
  thesisRecordSchema,
  thesisVersionRecordSchema
} from './records';

describe('company records', () => {
  it('accepts a valid record, with and without the optional descriptors', () => {
    expect(companyRecordSchema.safeParse(company()).success).toBe(true);
    const bare = { ...company(), ticker: undefined, exchange: undefined, sector: undefined };
    expect(companyRecordSchema.safeParse(bare).success).toBe(true);
  });

  it('strips unknown fields instead of rejecting them (additive-first migrations)', () => {
    const parsed = companyRecordSchema.parse({ ...company(), futureField: 'carried by v2' });
    expect(parsed).not.toHaveProperty('futureField');
  });

  it('rejects a non-integer data version', () => {
    expect(companyRecordSchema.safeParse(company({ dataVersion: 1.5 })).success).toBe(false);
  });

  it('rejects a currency that is not an ISO 4217 code', () => {
    expect(companyRecordSchema.safeParse(company({ currency: 'usd' })).success).toBe(false);
    expect(companyRecordSchema.safeParse(company({ currency: 'US' })).success).toBe(false);
  });

  it('rejects timestamps that are not ISO datetimes, and accepts explicit offsets', () => {
    expect(companyRecordSchema.safeParse(company({ updatedAt: '2026-07-11' })).success).toBe(false);
    expect(
      companyRecordSchema.safeParse(company({ updatedAt: '2026-07-11T19:30:00+10:00' })).success
    ).toBe(true);
  });
});

describe('statement records', () => {
  it('accepts entered and not-reported-zero values', () => {
    const row = incomeStatement({
      values: {
        revenue: { kind: 'entered', amountMinor: 1_000 },
        interestExpense: { kind: 'not_reported_zero' }
      }
    });
    expect(statementRecordSchema.safeParse(row).success).toBe(true);
  });

  it('rejects fractional, unsafe, and non-finite amounts', () => {
    for (const amountMinor of [1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY]) {
      const row = incomeStatement({ values: { revenue: { kind: 'entered', amountMinor } } });
      expect(statementRecordSchema.safeParse(row).success).toBe(false);
    }
  });

  it('rejects keys that are not canonical line items', () => {
    const values = { ebitda: { kind: 'entered', amountMinor: 1 } };
    const row = { ...incomeStatement(), values };
    expect(statementRecordSchema.safeParse(row).success).toBe(false);
  });

  it('rejects an item stored on the wrong statement', () => {
    const row = incomeStatement({ values: { capex: { kind: 'entered', amountMinor: 1_000 } } });
    const result = statementRecordSchema.safeParse(row);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('cashflow');
    }
  });

  it('rejects a negative magnitude on an unsigned item but allows the signed exceptions', () => {
    const negativeCapex = incomeStatement({
      statement: 'cashflow',
      values: { capex: { kind: 'entered', amountMinor: -1_000 } }
    });
    expect(statementRecordSchema.safeParse(negativeCapex).success).toBe(false);

    const lossYear = incomeStatement({
      values: { netIncome: { kind: 'entered', amountMinor: -5_000 } }
    });
    expect(statementRecordSchema.safeParse(lossYear).success).toBe(true);

    const negativeEquity = incomeStatement({
      statement: 'balance',
      values: { totalEquity: { kind: 'entered', amountMinor: -2_000 } }
    });
    expect(statementRecordSchema.safeParse(negativeEquity).success).toBe(true);
  });

  it('rejects malformed fiscal-year labels and end dates', () => {
    expect(statementRecordSchema.safeParse(incomeStatement({ fy: 'FY24' as never })).success).toBe(
      false
    );
    expect(statementRecordSchema.safeParse(incomeStatement({ fy: '2024' as never })).success).toBe(
      false
    );
    expect(
      statementRecordSchema.safeParse(incomeStatement({ endDate: '28/09/2024' })).success
    ).toBe(false);
  });

  it('accepts the full extraction provenance shape and bounds confidence to [0, 1]', () => {
    const provenance = {
      source: 'user_upload',
      recordedAt: T0,
      filing: { system: 'EDGAR', documentId: '0000320193-24-000123' },
      extraction: {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        promptVersion: '1',
        fields: { revenue: { confidence: 0.98, page: 42 } }
      }
    } as const;
    expect(statementRecordSchema.safeParse(incomeStatement({ provenance })).success).toBe(true);

    const overconfident = {
      ...provenance,
      extraction: { ...provenance.extraction, fields: { revenue: { confidence: 1.2 } } }
    };
    expect(
      statementRecordSchema.safeParse(incomeStatement({ provenance: overconfident })).success
    ).toBe(false);
  });
});

describe('price records', () => {
  it('accepts a positive integer price and rejects zero, negatives, and fractions', () => {
    expect(priceRecordSchema.safeParse(price()).success).toBe(true);
    expect(priceRecordSchema.safeParse(price({ amountMinor: 0 })).success).toBe(false);
    expect(priceRecordSchema.safeParse(price({ amountMinor: -100 })).success).toBe(false);
    expect(priceRecordSchema.safeParse(price({ amountMinor: 211.5 })).success).toBe(false);
  });
});

describe('thesis records and versions', () => {
  it('accepts theses and versions, with and without a financials snapshot', () => {
    expect(thesisRecordSchema.safeParse(thesis()).success).toBe(true);
    expect(thesisVersionRecordSchema.safeParse(thesisVersion({ id: 1 })).success).toBe(true);
    const withSnapshot = thesisVersion({
      id: 2,
      financialsSnapshot: {
        years: [
          {
            fy: 'FY2024',
            endDate: '2024-09-28',
            currency: 'USD',
            entryScale: 'millions',
            values: { revenue: { kind: 'entered', amountMinor: 1_000 } }
          }
        ],
        price: { amountMinor: 21_150, currency: 'USD', asOf: '2026-07-10' }
      }
    });
    expect(thesisVersionRecordSchema.safeParse(withSnapshot).success).toBe(true);
  });

  it('rejects a snapshot carrying a corrupt year', () => {
    const corrupt = thesisVersion({
      id: 3,
      financialsSnapshot: {
        years: [
          {
            fy: 'FY2024',
            endDate: '2024-09-28',
            currency: 'USD',
            entryScale: 'millions',
            values: { revenue: { kind: 'entered', amountMinor: 0.5 } }
          }
        ]
      }
    });
    expect(thesisVersionRecordSchema.safeParse(corrupt).success).toBe(false);
  });
});

describe('flag dismissal records', () => {
  it('accepts every pinned rule id and rejects anything else', () => {
    for (const ruleId of RULE_IDS) {
      expect(flagDismissalRecordSchema.safeParse(dismissal({ ruleId })).success).toBe(true);
    }
    expect(
      flagDismissalRecordSchema.safeParse(dismissal({ ruleId: 'notARule' as never })).success
    ).toBe(false);
  });
});

describe('provider credential records', () => {
  it('accepts a credential and rejects an empty key', () => {
    expect(providerCredentialRecordSchema.safeParse(credential()).success).toBe(true);
    expect(providerCredentialRecordSchema.safeParse(credential({ key: '' })).success).toBe(false);
  });
});

describe('quarantine records', () => {
  it('accepts any raw payload', () => {
    const row = { id: 1, table: 'companies', raw: { anything: true }, reason: 'x', quarantinedAt: T0 };
    expect(quarantineRecordSchema.safeParse(row).success).toBe(true);
  });
});

describe('meta records', () => {
  it('accepts each pinned key with its value shape', () => {
    const rows = [
      { key: 'onboardingDone', value: true },
      { key: 'lastExportAt', value: T0 },
      { key: 'theme', value: 'dark' },
      { key: 'educationLayerOff', value: false },
      { key: 'schemaVersion', value: 1 }
    ];
    for (const row of rows) {
      expect(metaRecordSchema.safeParse(row).success).toBe(true);
    }
  });

  it('rejects wrong value shapes and unknown keys', () => {
    expect(metaRecordSchema.safeParse({ key: 'theme', value: 'blue' }).success).toBe(false);
    expect(metaRecordSchema.safeParse({ key: 'onboardingDone', value: 'yes' }).success).toBe(false);
    expect(metaRecordSchema.safeParse({ key: 'favouriteMetric', value: 'roe' }).success).toBe(false);
  });
});
