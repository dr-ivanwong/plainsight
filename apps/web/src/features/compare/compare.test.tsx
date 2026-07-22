// @vitest-environment jsdom

// The compare screen (frontend spec §3): picker state first, the selection in
// `?ids=`, best-in-row ticks, and the currency-comparability rule (data-model
// spec §4) hiding money rows across currencies.
import 'fake-indexeddb/auto';
import type { EntryValue } from '@plainsight/calc-engine';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db, upsertStatement, type CompanyRecord } from '../../db';
import { routeTree } from '../../routeTree.gen';

const e = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

const MANUAL = { source: 'manual', recordedAt: '2026-07-11T09:30:00Z' } as const;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** One company with one fiscal year: enough income for net margin, enough cash flow for FCF. */
async function seedCompany(
  name: string,
  currency: string,
  netIncomeMinor: number
): Promise<CompanyRecord> {
  const company = await createCompany(db, { name, currency });
  await upsertStatement(db, {
    companyId: company.id,
    fy: 'FY2024',
    statement: 'income',
    endDate: '2024-06-30',
    entryScale: 'ones',
    values: { revenue: e(100_000), netIncome: e(netIncomeMinor) },
    provenance: MANUAL
  });
  await upsertStatement(db, {
    companyId: company.id,
    fy: 'FY2024',
    statement: 'cashflow',
    endDate: '2024-06-30',
    entryScale: 'ones',
    values: { operatingCashFlow: e(30_000), capex: e(10_000) },
    provenance: MANUAL
  });
  return company;
}

/** A prior year, so the trend has two points to speak about. */
async function seedPriorYear(companyId: string, netIncomeMinor: number): Promise<void> {
  await upsertStatement(db, {
    companyId,
    fy: 'FY2023',
    statement: 'income',
    endDate: '2023-06-30',
    entryScale: 'ones',
    values: { revenue: e(100_000), netIncome: e(netIncomeMinor) },
    provenance: MANUAL
  });
}

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the compare screen', () => {
  it('prompts to grow the library before offering the picker', async () => {
    await seedCompany('Apple Inc.', 'USD', 20_000);
    renderAt('/compare');

    expect(await screen.findByRole('heading', { name: 'Compare' })).toBeVisible();
    expect(screen.getByText(/needs at least two companies/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a company' })).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'Companies to compare' })
    ).not.toBeInTheDocument();
  });

  it('starts as a picker and builds the grid as chips toggle on', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    await seedCompany('Coca-Cola', 'USD', 15_000);
    const router = renderAt('/compare');

    const group = await screen.findByRole('group', { name: 'Companies to compare' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: 'Apple Inc.' }));
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Apple Inc.' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    fireEvent.click(within(group).getByRole('button', { name: 'Costco' }));

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'Apple Inc.' })).toBeVisible();
    expect(within(table).getByRole('link', { name: 'Costco' })).toBeVisible();
    expect(router.state.location.search).toEqual({ ids: `${apple.id},${costco.id}` });
  });

  it('ticks the best value in a row, and only that one', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    renderAt(`/compare?ids=${apple.id},${costco.id}`);

    const label = await screen.findByRole('rowheader', { name: 'Net margin' });
    const row = label.closest('tr');
    expect(row).not.toBeNull();
    // The row header renders with the table skeleton, but each company's
    // cell value fills from its own Dexie live query, which can resolve a
    // tick later; wait for the values before reading them, or a loaded
    // runner sees the "No data" placeholder and the row's "best" badge is
    // not yet placed.
    await waitFor(() => {
      const pending = within(row as HTMLElement).getAllByRole('cell');
      expect(pending[0]).toHaveTextContent('20.0%');
      expect(pending[1]).toHaveTextContent('10.0%');
    });
    const cells = within(row as HTMLElement).getAllByRole('cell');
    expect(within(cells[0] as HTMLElement).getByText('Best of the group')).toBeInTheDocument();
    expect(
      within(cells[1] as HTMLElement).queryByText('Best of the group')
    ).not.toBeInTheDocument();
  });

  it('hides money rows across currencies and says why', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const wes = await seedCompany('Wesfarmers', 'AUD', 10_000);
    renderAt(`/compare?ids=${apple.id},${wes.id}`);

    await screen.findByRole('table');
    expect(screen.getByText(/report in different currencies/)).toBeVisible();
    expect(screen.queryByRole('rowheader', { name: 'Free cash flow' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Net margin' })).toBeInTheDocument();
  });

  it('compares money rows freely within one currency', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    renderAt(`/compare?ids=${apple.id},${costco.id}`);

    await screen.findByRole('table');
    expect(screen.getByRole('rowheader', { name: 'Free cash flow' })).toBeInTheDocument();
    expect(screen.queryByText(/report in different currencies/)).not.toBeInTheDocument();
  });

  it('drops unknown ids from the address instead of crashing', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    renderAt(`/compare?ids=ghost,${apple.id},${costco.id}`);

    const table = await screen.findByRole('table');
    // The measure column plus the two real companies; the ghost never lands.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
  });

  it('keeps the trend quiet until two years exist to trend', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    renderAt(`/compare?ids=${apple.id},${costco.id}`);

    await screen.findByRole('table');
    expect(screen.queryByRole('radiogroup', { name: 'Trend measure' })).not.toBeInTheDocument();
  });

  it('offers the trend measures below the grid, defaulting to ROE', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    await seedPriorYear(apple.id, 15_000);
    await seedPriorYear(costco.id, 12_000);
    renderAt(`/compare?ids=${apple.id},${costco.id}`);

    const group = await screen.findByRole('radiogroup', { name: 'Trend measure' });
    expect(within(group).getAllByRole('radio')).toHaveLength(12);
    expect(within(group).getByRole('radio', { name: 'ROE' })).toBeChecked();
  });

  it('moves the trend measure into the address', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    await seedPriorYear(apple.id, 15_000);
    await seedPriorYear(costco.id, 12_000);
    const router = renderAt(`/compare?ids=${apple.id},${costco.id}`);

    const group = await screen.findByRole('radiogroup', { name: 'Trend measure' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Net margin' }));

    await waitFor(() =>
      expect(within(group).getByRole('radio', { name: 'Net margin' })).toBeChecked()
    );
    expect(router.state.location.search).toEqual({
      ids: `${apple.id},${costco.id}`,
      metric: 'netMargin'
    });
  });

  it('shows the trend as a table on demand, in the pinned words', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const costco = await seedCompany('Costco', 'USD', 10_000);
    await seedPriorYear(apple.id, 15_000);
    await seedPriorYear(costco.id, 12_000);
    renderAt(`/compare?ids=${apple.id},${costco.id}&metric=netMargin`);

    fireEvent.click(await screen.findByRole('button', { name: 'Show table' }));

    const trend = await screen.findByRole('region', { name: 'Trend' });
    const year = within(trend).getByRole('rowheader', { name: 'FY2023' });
    const row = year.closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('15.0%');
    expect(cells[1]).toHaveTextContent('12.0%');
    expect(screen.getByRole('button', { name: 'Show chart' })).toBeVisible();
  });

  it('drops money measures from the trend across currencies and degrades the address', async () => {
    const apple = await seedCompany('Apple Inc.', 'USD', 20_000);
    const wes = await seedCompany('Wesfarmers', 'AUD', 10_000);
    await seedPriorYear(apple.id, 15_000);
    await seedPriorYear(wes.id, 12_000);
    renderAt(`/compare?ids=${apple.id},${wes.id}&metric=fcf`);

    const group = await screen.findByRole('radiogroup', { name: 'Trend measure' });
    expect(within(group).queryByRole('radio', { name: 'Free cash flow' })).not.toBeInTheDocument();
    expect(within(group).getAllByRole('radio')).toHaveLength(11);
    expect(within(group).getByRole('radio', { name: 'ROE' })).toBeChecked();
  });

  it('caps the pick at four, keeping unpicking one tap away', async () => {
    const seeded: CompanyRecord[] = [];
    for (const name of ['Apple Inc.', 'Costco', 'Coca-Cola', 'Microsoft', 'Union Pacific']) {
      seeded.push(await seedCompany(name, 'USD', 10_000));
    }
    const four = seeded
      .slice(0, 4)
      .map((company) => company.id)
      .join(',');
    renderAt(`/compare?ids=${four}`);

    const group = await screen.findByRole('group', { name: 'Companies to compare' });
    expect(within(group).getByRole('button', { name: 'Union Pacific' })).toBeDisabled();
    expect(within(group).getByRole('button', { name: 'Apple Inc.' })).toBeEnabled();
  });
});
