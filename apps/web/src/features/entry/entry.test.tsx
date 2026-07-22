// @vitest-environment jsdom

// The data entry screen (frontend spec §3): draft years, autosave commits
// through the repository, the segmented statement control, per-year header
// facts, and the pinned deep-link focus (data-model spec §10).
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db, upsertStatement, type CompanyRecord } from '../../db';
import { routeTree } from '../../routeTree.gen';
import { incomeStatement } from '../../test/builders';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

/** jsdom has no navigator.storage; give it one with a chosen fill level. */
const stubStorageEstimate = (usage: number, quota: number): void => {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: async () => ({ usage, quota }),
      persisted: async () => false,
      persist: async () => false
    }
  });
};

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'Apple Inc.', ticker: 'AAPL', currency: 'USD' });

const seedIncomeRow = async (companyId: string): Promise<void> => {
  const { updatedAt: _stamp, ...write } = incomeStatement({ companyId });
  await upsertStatement(db, write);
};

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the data entry screen', () => {
  it('surfaces storage pressure before writes begin failing, quietly', async () => {
    // 90 of 100: past the four-fifths threshold (main plan section 14).
    stubStorageEstimate(90, 100);
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry`);

    const banner = await screen.findByText(/Storage on this device is nearly full \(90% used\)/);
    expect(banner).toBeVisible();
    // The export prompt the state table pins: a link, never a modal.
    expect(within(banner).getByRole('link', { name: 'Data & storage' })).toHaveAttribute(
      'href',
      '/settings/data'
    );
    // Non-blocking: the grid is still there beneath it.
    expect(screen.getByRole('textbox', { name: 'Revenue, FY2024' })).toBeVisible();
  });

  it('stays silent about storage while there is room', async () => {
    stubStorageEstimate(10, 100);
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry`);

    await screen.findByRole('textbox', { name: 'Revenue, FY2024' });
    expect(screen.queryByText(/nearly full/)).not.toBeInTheDocument();
  });

  it('asks for the first fiscal year when none exist, and keeps a draft local until a figure commits', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/entry`);

    expect(await screen.findByText(/No fiscal years yet/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Year-end date'), {
      target: { value: '2024-09-28' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }));

    expect(await screen.findByRole('columnheader', { name: /FY2024/ })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Revenue, FY2024' })).toHaveFocus();
    });
    expect(await db.statements.count()).toBe(0);
  });

  it('creates the row on first commit, stamps manual provenance, and reports the save', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/entry`);

    fireEvent.change(await screen.findByLabelText('Year-end date'), {
      target: { value: '2024-09-28' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }));

    const revenue = await screen.findByRole('textbox', { name: 'Revenue, FY2024' });
    fireEvent.change(revenue, { target: { value: '391,035' } });
    fireEvent.blur(revenue);

    await waitFor(async () => {
      expect(await db.statements.count()).toBe(1);
    });
    const row = await db.statements.get([company.id, 'FY2024', 'income']);
    expect(row).toMatchObject({
      endDate: '2024-09-28',
      entryScale: 'millions',
      values: { revenue: { kind: 'entered', amountMinor: 39_103_500_000_000 } }
    });
    expect(row?.provenance.source).toBe('manual');
    expect((await db.companies.get(company.id))?.dataVersion).toBe(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Saved · just now');
  });

  it('switches statements through the segmented control', async () => {
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry`);

    await screen.findByRole('textbox', { name: 'Revenue, FY2024' });
    fireEvent.click(screen.getByRole('radio', { name: 'Balance' }));

    expect(await screen.findByRole('textbox', { name: 'Total equity, FY2024' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Revenue, FY2024' })).not.toBeInTheDocument();
  });

  it('counts core items and names the source in the year header', async () => {
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry`);

    const header = await screen.findByRole('columnheader', { name: /FY2024/ });
    expect(within(header).getByText('2 of 8 core items')).toBeVisible();
    expect(within(header).getByText('entered by hand')).toBeVisible();
  });

  it('lands deep links on the addressed field', async () => {
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry?stmt=income&fy=FY2024&focus=netIncome`);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Net income, FY2024' })).toHaveFocus();
    });
  });

  it('stores the not-reported assertion from a field menu', async () => {
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry`);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Interest expense, FY2024, options' })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Not reported → 0' }));

    await waitFor(async () => {
      const row = await db.statements.get([company.id, 'FY2024', 'income']);
      expect(row?.values.interestExpense).toEqual({ kind: 'not_reported_zero' });
    });
    expect(
      await screen.findByRole('button', {
        name: 'Interest expense, FY2024, not reported, counted as zero'
      })
    ).toBeVisible();
  });

  it('re-displays and persists a per-year scale change without touching stored amounts', async () => {
    const company = await seedCompany();
    await seedIncomeRow(company.id);
    renderAt(`/company/${company.id}/entry`);

    const select = await screen.findByRole('combobox', { name: 'FY2024 entry scale' });
    fireEvent.change(select, { target: { value: 'billions' } });

    await waitFor(async () => {
      const row = await db.statements.get([company.id, 'FY2024', 'income']);
      expect(row?.entryScale).toBe('billions');
      // The stored amount never moves; only the display scale does.
      expect(row?.values.revenue).toEqual({ kind: 'entered', amountMinor: 391_035_000 });
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Revenue, FY2024' })).toHaveValue('0.00391035');
    });
  });
});
