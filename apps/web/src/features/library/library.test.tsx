// @vitest-environment jsdom

// The library screen (frontend spec §3): empty and populated states, the
// add-company flow behind `?add=1`, sample chips, and the progressive filter.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    // Named by their composite labels: the navigation rail brings lists of
    // its own, so the rows are found by what they say, not where they sit.
    const labels = (await screen.findAllByRole('link', { name: /updated today/ })).map((link) =>
      link.getAttribute('aria-label')
    );
    expect(labels).toEqual(['Wesfarmers, updated today', 'Woolworths, updated today']);
  });

  it('offers compare once two companies exist, toolbar and rail alike', async () => {
    await createCompany(db, { name: 'Wesfarmers', ticker: 'WES', currency: 'AUD' });
    renderLibrary();
    await screen.findByRole('link', { name: 'Wesfarmers, updated today' });
    expect(screen.queryByRole('link', { name: 'Compare' })).not.toBeInTheDocument();

    await createCompany(db, { name: 'Woolworths', ticker: 'WOW', currency: 'AUD' });
    // Both surfaces follow the same progressive rule, so both appear.
    expect(await screen.findAllByRole('link', { name: 'Compare' })).toHaveLength(2);
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

    expect(await screen.findByRole('heading', { name: 'Cochlear' })).toBeVisible();
    expect(screen.getByText(/No statements yet/)).toBeVisible();
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

    expect(screen.getAllByRole('link', { name: /updated today/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Woolworths/ })).toBeVisible();
  });

  it('loads the sample set with one tap, banners it, and the banner dismisses for good', async () => {
    renderLibrary();
    fireEvent.click(
      await screen.findByRole('button', { name: 'See it with sample data' })
    );

    expect(await screen.findByRole('link', { name: /Apple, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Coca-Cola, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Costco, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /CSL, sample data/ })).toBeVisible();
    expect(screen.getAllByText('Sample')).toHaveLength(4);

    const bannerLink = screen.getByRole('link', { name: 'Data & storage' });
    expect(bannerLink.getAttribute('href')).toBe('/settings/data');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the sample note' }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Data & storage' })).not.toBeInTheDocument();
    });
    expect((await db.meta.get('sampleBannerDismissed'))?.value).toBe(true);
  });

  it('rows wear the ROE sparkline once history supports it', async () => {
    const { loadSampleData } = await import('./loadSamples');
    await loadSampleData(db);

    renderLibrary();
    const row = await screen.findByRole('link', { name: 'Apple, sample data, updated today' });
    await waitFor(() => {
      expect(row.querySelector('svg')).not.toBeNull();
    });
  });

  it('counts active flags in the row, and a dismissal quietens it', async () => {
    const flagged = await createCompany(db, { name: 'Levered Co', currency: 'AUD' });
    await upsertStatement(
      db,
      (({ updatedAt: _x, ...write }) => write)(
        incomeStatement({
          companyId: flagged.id,
          values: {
            revenue: { kind: 'entered', amountMinor: 100_000 },
            operatingIncome: { kind: 'entered', amountMinor: 2_000 },
            interestExpense: { kind: 'entered', amountMinor: 1_000 }
          }
        })
      )
    );

    renderLibrary();
    expect(
      await screen.findByRole('link', { name: 'Levered Co, 1 flag, updated today' })
    ).toBeVisible();
    expect(screen.getByText('● 1')).toBeVisible();

    await db.flagDismissals.put({
      companyId: flagged.id,
      ruleId: 'fragility',
      dismissedAtFy: 'FY2024',
      dismissedAt: T1
    });
    expect(
      await screen.findByRole('link', { name: 'Levered Co, updated today' })
    ).toBeVisible();
  });

  it('offers the Home Screen note on iOS, once, and remembers the dismissal', async () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    });
    try {
      renderLibrary();
      expect(await screen.findByText(/added to your Home Screen/)).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss the Home Screen note' }));
      await waitFor(() => {
        expect(screen.queryByText(/added to your Home Screen/)).not.toBeInTheDocument();
      });
      expect((await db.meta.get('iosInstallDismissed'))?.value).toBe(true);
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: original });
    }
  });

  it('keeps the filter hidden at a screenful or fewer', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    renderLibrary();
    await screen.findByRole('list');
    expect(screen.queryByRole('searchbox', { name: 'Filter companies' })).not.toBeInTheDocument();
  });
});
