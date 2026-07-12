// @vitest-environment jsdom

// Journey B in the client: the ticker-search sheet behind `?import=1`, the
// ingesting wait, the landing on the imported company, re-import resolving to
// the existing company, and the offline hiding with its pill.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FinancialsResponse } from '@plainsight/api-contract';

import { createCompany, db, setMeta } from '../../db';
import { routeTree } from '../../routeTree.gen';

vi.mock('../../api/client', () => ({
  searchTickers: vi.fn(),
  fetchFinancials: vi.fn()
}));

import { fetchFinancials, searchTickers } from '../../api/client';

const searchMock = vi.mocked(searchTickers);
const financialsMock = vi.mocked(fetchFinancials);

const RESPONSE: FinancialsResponse = {
  ticker: 'AAPL',
  statements: [
    {
      fy: 'FY2024',
      statement: 'income',
      endDate: '2024-09-28',
      currency: 'USD',
      values: { revenue: 39_103_500_000_000, netIncome: 9_373_600_000_000 },
      provenance: {
        source: 'edgar',
        recordedAt: '2026-07-12T00:00:00Z',
        filing: { system: 'EDGAR', documentId: '0000320193-24-000123' },
        mappingVersion: 'edgar-us-gaap-1'
      }
    }
  ],
  gaps: []
};

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
  searchMock.mockResolvedValue({
    results: [{ ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, exchange: 'Nasdaq' }]
  });
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

async function searchAndPick(): Promise<void> {
  const input = await screen.findByRole('searchbox', {
    name: 'Search by ticker or company name'
  });
  fireEvent.change(input, { target: { value: 'apple' } });
  const result = await screen.findByRole('button', { name: /AAPL.*Apple Inc\./ });
  fireEvent.click(result);
}

describe('the import sheet', () => {
  it('searches with a debounce and shows exchange badges', async () => {
    renderAt('/?import=1');
    const input = await screen.findByRole('searchbox', {
      name: 'Search by ticker or company name'
    });
    fireEvent.change(input, { target: { value: 'app' } });
    fireEvent.change(input, { target: { value: 'apple' } });
    await screen.findByRole('button', { name: /AAPL.*Apple Inc\./ });
    expect(screen.getByText('Nasdaq')).toBeVisible();
    // The keystroke burst collapsed into one request for the settled query.
    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
    expect(searchMock.mock.calls[0]?.[0]).toBe('apple');
  });

  it('imports through the ingesting wait and lands on the new company', async () => {
    financialsMock
      .mockResolvedValueOnce({ kind: 'ingesting', retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ kind: 'ok', data: RESPONSE });
    const router = renderAt('/?import=1');
    await searchAndPick();

    expect(await screen.findByText(/Fetching AAPL filings from EDGAR/)).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/company\//));
    expect(financialsMock).toHaveBeenCalledTimes(2);
    const imported = await db.companies.filter((entry) => entry.ticker === 'AAPL').first();
    expect(imported?.name).toBe('Apple Inc.');
    const rows = await db.statements.where('companyId').equals(imported?.id ?? '').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provenance.source).toBe('edgar');
  });

  it('opens the existing company instead of importing a twin', async () => {
    const existing = await createCompany(db, {
      name: 'Apple Inc.',
      ticker: 'AAPL',
      currency: 'USD'
    });
    const router = renderAt('/?import=1');
    await searchAndPick();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/company/${existing.id}`)
    );
    expect(financialsMock).not.toHaveBeenCalled();
  });

  it('surfaces the degraded state with the manual path', async () => {
    financialsMock.mockResolvedValue({
      kind: 'unavailable',
      message: 'The import service is unreachable. You can enter the numbers manually.'
    });
    renderAt('/?import=1');
    await searchAndPick();
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the numbers manually/);
    // The manual escape hatch swaps to the add-company sheet. The swap
    // remounts both dialogs, so wait for the settled state rather than a
    // transient element.
    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Add a company' })).toBeVisible()
    );
  });
});

describe('the offline posture (degradation matrix, main plan §5)', () => {
  it('hides the import affordance and shows the quiet pill', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderAt('/');
    await screen.findByRole('heading', { name: 'Library' });
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeVisible();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('shows the import affordance online', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Library' });
    expect(screen.getByRole('button', { name: 'Import' })).toBeVisible();
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });
});
