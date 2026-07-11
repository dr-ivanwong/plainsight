// @vitest-environment jsdom

// The library screen (frontend spec §3): empty and populated states, the
// add-company flow behind `?add=1`, sample chips, and the progressive filter.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompany, db, setMeta, upsertStatement } from '../../db';
import { routeTree } from '../../routeTree.gen';
import { company, incomeStatement } from '../../test/builders';

const T1 = '2026-07-11T10:00:00Z';
const T2 = '2026-07-11T10:01:00Z';
const T3 = '2026-07-11T10:02:00Z';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(T1) });
  await db.delete();
  await db.open();
  // These tests exercise the library, not the first-launch gate.
  await setMeta(db, 'onboardingDone', true);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderLibrary(path = '/') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the library', () => {
  it('shows the hero empty state when no companies exist', async () => {
    renderLibrary();
    expect(
      await screen.findByRole('heading', { name: 'Read financial statements like an owner' })
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
  });

  it('lists companies most recently updated first, as single links', async () => {
    const wes = await createCompany(db, { name: 'Wesfarmers', ticker: 'WES', currency: 'AUD' });
    vi.setSystemTime(new Date(T2));
    await createCompany(db, { name: 'Woolworths', ticker: 'WOW', currency: 'AUD' });
    vi.setSystemTime(new Date(T3));
    await upsertStatement(db, (({ updatedAt: _x, ...write }) => write)(incomeStatement({ companyId: wes.id })));

    renderLibrary();
    const list = await screen.findByRole('list');
    const labels = within(list)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    expect(labels).toEqual(['Wesfarmers, updated today', 'Woolworths, updated today']);
  });

  it('marks sample companies with a quiet chip', async () => {
    await db.companies.put(company({ id: 'sample-apple', name: 'Apple Inc.', sample: true }));
    renderLibrary();
    expect(await screen.findByText('Sample')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Apple Inc., sample data, updated today' })
    ).toBeVisible();
  });

  it('adds a company through the sheet and lands on its dashboard', async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a company' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add a company' });
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Cochlear' }
    });
    fireEvent.change(within(dialog).getByLabelText('Ticker'), {
      target: { value: 'coh' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add company' }));

    expect(await screen.findByRole('heading', { name: 'Company dashboard' })).toBeVisible();
    const stored = await db.companies.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Cochlear', ticker: 'COH', currency: 'AUD' });
  });

  it('opens the sheet from the toolbar when populated', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add' }));
    expect(await screen.findByRole('dialog', { name: 'Add a company' })).toBeVisible();
  });

  it('reveals the filter only past a screenful and filters by name or ticker', async () => {
    for (let index = 1; index <= 12; index += 1) {
      await createCompany(db, { name: `Filler ${index}`, currency: 'AUD' });
    }
    await createCompany(db, { name: 'Woolworths', ticker: 'WOW', currency: 'AUD' });

    renderLibrary();
    const filter = await screen.findByRole('searchbox', { name: 'Filter companies' });
    fireEvent.change(filter, { target: { value: 'wow' } });

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(within(list).getByRole('link', { name: /Woolworths/ })).toBeVisible();
  });

  it('keeps the filter hidden at a screenful or fewer', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    renderLibrary();
    await screen.findByRole('list');
    expect(screen.queryByRole('searchbox', { name: 'Filter companies' })).not.toBeInTheDocument();
  });
});
