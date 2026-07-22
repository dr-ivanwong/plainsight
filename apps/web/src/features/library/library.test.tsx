// @vitest-environment jsdom

// The library screen (frontend spec §3): empty and populated states, the
// add-company flow behind `?add=1`, sample chips, and the progressive filter.
import 'fake-indexeddb/auto';
import type { EntryValue } from '@plainsight/calc-engine';
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** jsdom has no matchMedia; the screener tests pick the width themselves. */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      }) as unknown as MediaQueryList
  );
}

const e = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

/** One computable year: ROE = netIncome over totalEquity, ending basis. */
async function seedRoe(companyId: string, netIncome: number, equity: number): Promise<void> {
  const provenance = { source: 'manual', recordedAt: T1 } as const;
  await upsertStatement(db, {
    companyId,
    fy: 'FY2024',
    statement: 'income',
    endDate: '2024-06-30',
    entryScale: 'ones',
    values: { revenue: e(100_000), netIncome: e(netIncome) },
    provenance
  });
  await upsertStatement(db, {
    companyId,
    fy: 'FY2024',
    statement: 'balance',
    endDate: '2024-06-30',
    entryScale: 'ones',
    values: { totalEquity: e(equity) },
    provenance
  });
}

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

  it('groups rows under quiet sector headers, vocabulary order, unclassified last', async () => {
    await createCompany(db, { name: 'JB Hi-Fi', currency: 'AUD', sector: 'retail' });
    vi.setSystemTime(new Date(T2));
    await createCompany(db, { name: 'CSL', currency: 'AUD', sector: 'healthcare' });
    vi.setSystemTime(new Date(T3));
    await createCompany(db, { name: 'Zeta Holdings', currency: 'AUD' });

    renderLibrary();
    await screen.findByRole('link', { name: /Zeta Holdings/ });
    const headers = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headers).toEqual(['Healthcare', 'Retail', 'Unclassified']);

    // Each section's list is named by its header and holds its own rows.
    const healthcare = screen.getByRole('list', { name: 'Healthcare' });
    expect(within(healthcare).getByRole('link', { name: /CSL/ })).toBeVisible();
    const unclassified = screen.getByRole('list', { name: 'Unclassified' });
    expect(within(unclassified).getByRole('link', { name: /Zeta Holdings/ })).toBeVisible();
  });

  it('reads flat, no headers, while nothing is classified', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    await createCompany(db, { name: 'Woolworths', currency: 'AUD' });
    renderLibrary();
    await screen.findByRole('link', { name: /Wesfarmers/ });
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('drops sections the filter empties, headers included', async () => {
    for (let index = 1; index <= 12; index += 1) {
      await createCompany(db, { name: `Filler ${index}`, currency: 'AUD' });
    }
    await createCompany(db, { name: 'CSL', ticker: 'CSL', currency: 'AUD', sector: 'healthcare' });

    renderLibrary();
    const filter = await screen.findByRole('searchbox', { name: 'Filter companies' });

    // Matching only the classified row: Unclassified drops with its header.
    fireEvent.change(filter, { target: { value: 'csl' } });
    expect(screen.getAllByRole('link', { name: /updated today/ })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Healthcare' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Unclassified' })
    ).not.toBeInTheDocument();

    // Matching only unclassified rows: every header goes and the list reads flat.
    fireEvent.change(filter, { target: { value: 'Filler 3' } });
    expect(screen.getAllByRole('link', { name: /updated today/ })).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('carries the watchlist figure on a row once ROE computes', async () => {
    const wes = await createCompany(db, { name: 'Wesfarmers', ticker: 'WES', currency: 'AUD' });
    await seedRoe(wes.id, 15_000, 40_000);

    renderLibrary();

    const row = await screen.findByRole('link', { name: /ROE 37\.5%/ });
    expect(within(row).getByText('37.5%')).toBeVisible();
    expect(within(row).getByText('ROE')).toBeVisible();
  });

  it('offers the screener at desktop width, sortable and persistent', async () => {
    stubMatchMedia(true);
    const wes = await createCompany(db, { name: 'Wesfarmers', ticker: 'WES', currency: 'AUD' });
    await seedRoe(wes.id, 15_000, 40_000);
    vi.setSystemTime(new Date(T2));
    const wow = await createCompany(db, { name: 'Woolworths', ticker: 'WOW', currency: 'AUD' });
    await seedRoe(wow.id, 8_000, 40_000);

    renderLibrary();
    fireEvent.click(await screen.findByRole('radio', { name: 'Table' }));

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /Debt-to-equity/ })).toBeVisible();
    const wesRow = await within(table).findByRole('row', { name: /Wesfarmers/ });
    expect(wesRow).toHaveTextContent('37.5%');
    expect(wesRow).toHaveTextContent('WES');
    await waitFor(async () => {
      expect((await db.meta.get('libraryTableView'))?.value).toBe(true);
    });

    // First press sorts the figure biggest-first; the second flips it.
    fireEvent.click(within(table).getByRole('button', { name: 'ROE' }));
    const sorted = within(table).getAllByRole('row').slice(1);
    expect(sorted[0]).toHaveTextContent('Wesfarmers');
    expect(sorted[1]).toHaveTextContent('Woolworths');
    fireEvent.click(within(table).getByRole('button', { name: /ROE/ }));
    const flipped = within(table).getAllByRole('row').slice(1);
    expect(flipped[0]).toHaveTextContent('Woolworths');
  });

  it('keeps the rows below the breakpoint whatever the stored choice', async () => {
    stubMatchMedia(false);
    await setMeta(db, 'libraryTableView', true);
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });

    renderLibrary();

    await screen.findByRole('link', { name: /Wesfarmers/ });
    expect(screen.queryByRole('radiogroup', { name: 'Library view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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

  it('adds a company with a sector picked from the vocabulary, stored as its id', async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a company' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add a company' });
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Commonwealth Bank' }
    });
    const picker = within(dialog).getByLabelText('Sector');
    // The picker offers the vocabulary's labels with None first; free text retired.
    expect(
      within(picker).getAllByRole('option').map((option) => option.textContent)
    ).toEqual([
      'None',
      'Healthcare',
      'Technology',
      'Banks',
      'Retail',
      'Resources',
      'Property',
      'Industrials',
      'Insurance'
    ]);
    fireEvent.change(picker, { target: { value: 'banks' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add company' }));

    expect(await screen.findByRole('heading', { name: 'Commonwealth Bank' })).toBeVisible();
    const stored = await db.companies.toArray();
    expect(stored[0]?.sector).toBe('banks');
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

    // The ASX golden five since the ASX-first steer (data-model spec §12,
    // the sample-corpus decision as amended twice on 2026-07-18).
    expect(await screen.findByRole('link', { name: /CSL, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Wesfarmers, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Woolworths, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /JB Hi-Fi, sample data/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Cochlear, sample data/ })).toBeVisible();
    expect(screen.getAllByText('Sample')).toHaveLength(5);

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
    const row = await screen.findByRole('link', { name: 'CSL, sample data, updated today' });
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
