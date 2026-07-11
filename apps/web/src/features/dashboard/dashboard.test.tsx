// @vitest-environment jsdom

// The company dashboard (frontend spec §3): the twelve-card budget, pinned
// degenerate phrases, insufficient-data deep links, and the collapsing
// valuation cards.
import 'fake-indexeddb/auto';
import type { EntryValue, FyLabel } from '@plainsight/calc-engine';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createCompany,
  db,
  putPrice,
  setMeta,
  upsertStatement,
  type CompanyRecord,
  type StatementWrite
} from '../../db';
import { routeTree } from '../../routeTree.gen';

const e = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

const MANUAL = { source: 'manual', recordedAt: '2026-07-11T09:30:00Z' } as const;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'Apple Inc.', currency: 'USD', sector: 'Technology' });

const yearWrite = (
  companyId: string,
  statement: StatementWrite['statement'],
  values: StatementWrite['values'],
  fy: FyLabel = 'FY2024'
): StatementWrite => ({
  companyId,
  fy,
  statement,
  endDate: '2024-09-28',
  entryScale: 'ones',
  values,
  provenance: MANUAL
});

async function seedFullYear(companyId: string, equityMinor = 40_000): Promise<void> {
  await upsertStatement(
    db,
    yearWrite(companyId, 'income', {
      revenue: e(100_000),
      costOfRevenue: e(60_000),
      operatingIncome: e(20_000),
      interestExpense: e(1_000),
      pretaxIncome: e(19_000),
      taxExpense: e(4_000),
      netIncome: e(15_000),
      dilutedShares: e(10_000)
    })
  );
  await upsertStatement(
    db,
    yearWrite(companyId, 'balance', {
      cashAndEquivalents: e(5_000),
      currentAssets: e(30_000),
      totalAssets: e(100_000),
      currentLiabilities: e(15_000),
      shortTermDebt: e(2_000),
      longTermDebt: e(18_000),
      totalLiabilities: e(60_000),
      totalEquity: e(equityMinor)
    })
  );
  await upsertStatement(
    db,
    yearWrite(companyId, 'cashflow', {
      operatingCashFlow: e(18_000),
      capex: e(6_000)
    })
  );
}

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the company dashboard', () => {
  it('renders the twelve pinned cards for a complete year with a price', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await putPrice(db, { companyId: company.id, amountMinor: 30, currency: 'USD', asOf: '2026-07-10' });

    renderAt(`/company/${company.id}`);

    expect(await screen.findByRole('heading', { name: 'Apple Inc.' })).toBeVisible();
    expect(screen.getByText('Technology · FY2024 · USD')).toBeVisible();

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(12);
    });
    expect(within(screen.getByRole('article', { name: 'Gross margin' })).getByText('40.0%')).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'Current ratio' })).getByText('2.00')).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'ROE' })).getByText('37.5%')).toBeVisible();
    expect(
      within(screen.getByRole('article', { name: 'Interest coverage' })).getByText('20.0×')
    ).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'P/E' })).getByText('20.00')).toBeVisible();
    expect(screen.queryByText('FCF margin')).not.toBeInTheDocument();
    expect(screen.queryByText('Earnings yield')).not.toBeInTheDocument();
  });

  it('collapses the two valuation cards into one enter-price card until a price exists', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);

    expect(await screen.findByRole('article', { name: "Enter today's price" })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'P/E' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'FCF yield' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(11);
  });

  it('expands valuation in place when the price is saved', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);
    const card = await screen.findByRole('article', { name: "Enter today's price" });
    fireEvent.change(within(card).getByLabelText('Price'), { target: { value: '0.30' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));

    const pe = await screen.findByRole('article', { name: 'P/E' });
    expect(within(pe).getByText('20.00')).toBeVisible();
    expect(within(pe).getByText(/as of \d{4}-\d{2}-\d{2}/)).toBeVisible();
  });

  it('deep-links an insufficient card to the first missing number', async () => {
    const company = await seedCompany();
    await upsertStatement(
      db,
      yearWrite(company.id, 'income', {
        revenue: e(100_000),
        netIncome: e(15_000)
      })
    );

    renderAt(`/company/${company.id}`);

    const roe = await screen.findByRole('article', { name: 'ROE' });
    expect(within(roe).getByText('Add the 1 missing number')).toBeVisible();
    const link = roe.closest('a');
    expect(link?.getAttribute('href')).toContain('stmt=balance');
    expect(link?.getAttribute('href')).toContain('fy=FY2024');
    expect(link?.getAttribute('href')).toContain('focus=totalEquity');
  });

  it('speaks the pinned phrase for a degenerate denominator', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id, -2_000);

    renderAt(`/company/${company.id}`);

    const roe = await screen.findByRole('article', { name: 'ROE' });
    expect(within(roe).getByText('n/m: negative equity')).toBeVisible();
  });

  it('points an empty company at data entry', async () => {
    const company = await seedCompany();

    renderAt(`/company/${company.id}`);

    expect(await screen.findByText(/No statements yet/)).toBeVisible();
    const link = screen.getByRole('link', { name: 'Add the first year' });
    expect(link.getAttribute('href')).toBe(`/company/${company.id}/entry`);
  });

  it('marks a stale price on the valuation cards', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await putPrice(db, { companyId: company.id, amountMinor: 30, currency: 'USD', asOf: '2026-01-01' });

    renderAt(`/company/${company.id}`);

    const pe = await screen.findByRole('article', { name: 'P/E' });
    expect(within(pe).getByText('as of 2026-01-01')).toBeVisible();
  });
});
