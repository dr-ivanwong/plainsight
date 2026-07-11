/**
 * Record builders for db-layer tests: one canonically valid record per table,
 * with per-test overrides. Timestamps are fixed so assertions stay literal.
 */
import type {
  CompanyRecord,
  FlagDismissalRecord,
  PriceRecord,
  ProviderCredentialRecord,
  StatementRecord,
  ThesisRecord,
  ThesisVersionRecord
} from '../db/records';

export const T0 = '2026-07-11T09:30:00Z';

export const company = (over: Partial<CompanyRecord> = {}): CompanyRecord => ({
  id: 'apple',
  name: 'Apple Inc.',
  ticker: 'AAPL',
  currency: 'USD',
  sample: false,
  createdAt: T0,
  updatedAt: T0,
  dataVersion: 0,
  ...over
});

export const incomeStatement = (over: Partial<StatementRecord> = {}): StatementRecord => ({
  companyId: 'apple',
  fy: 'FY2024',
  statement: 'income',
  endDate: '2024-09-28',
  entryScale: 'millions',
  values: {
    revenue: { kind: 'entered', amountMinor: 391_035_000 },
    netIncome: { kind: 'entered', amountMinor: 93_736_000 }
  },
  provenance: { source: 'manual', recordedAt: T0 },
  updatedAt: T0,
  ...over
});

export const price = (over: Partial<PriceRecord> = {}): PriceRecord => ({
  companyId: 'apple',
  amountMinor: 21_150,
  currency: 'USD',
  asOf: '2026-07-10',
  updatedAt: T0,
  ...over
});

export const thesis = (over: Partial<ThesisRecord> = {}): ThesisRecord => ({
  companyId: 'apple',
  sections: {
    business: 'Sells hardware people queue for.',
    moat: 'Ecosystem switching costs.',
    valuation: '',
    kills: ''
  },
  updatedAt: T0,
  ...over
});

export const thesisVersion = (
  over: Partial<ThesisVersionRecord> = {}
): Omit<ThesisVersionRecord, 'id'> & Partial<Pick<ThesisVersionRecord, 'id'>> => ({
  companyId: 'apple',
  savedAt: T0,
  sections: thesis().sections,
  ...over
});

export const dismissal = (over: Partial<FlagDismissalRecord> = {}): FlagDismissalRecord => ({
  companyId: 'apple',
  ruleId: 'fragility',
  dismissedAtFy: 'FY2024',
  dismissedAt: T0,
  ...over
});

export const credential = (over: Partial<ProviderCredentialRecord> = {}): ProviderCredentialRecord => ({
  providerId: 'anthropic',
  key: 'sk-test-not-a-real-key',
  label: 'Dedicated Plainsight key',
  addedAt: T0,
  ...over
});
