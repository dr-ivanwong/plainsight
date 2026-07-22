// @vitest-environment jsdom
/**
 * The backtest surface against a stubbed API: the picker, the focused
 * pair's windows kept visibly separate, the stated gates, the trade
 * list, and the states.
 */
import 'fake-indexeddb/auto';

import type { BacktestPair, PairsBacktestCollection } from '@plainsight/api-contract';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../db';
import { setMeta } from '../../db/meta';
import { queryClient, Route as rootRoute } from '../../routes/__root';
import { routeTree } from '../../routeTree.gen';

void rootRoute;

function windowResult(
  start: string,
  end: string,
  sharpe: number,
  overrides: Partial<BacktestPair['train']> = {}
): BacktestPair['train'] {
  return {
    start,
    end,
    totalReturnPct: 4.2,
    annualSharpe: sharpe,
    maxDrawdownPct: -6.1,
    winRatePct: 52.0,
    tradeCount: 2,
    profitFactor: 1.8,
    capitalPerUnit: 350.0,
    equity: {
      dates: [start, end],
      values: [350.0, 364.7]
    },
    trades: [
      {
        entryDate: start,
        exitDate: end,
        direction: 1,
        daysHeld: 4,
        pnl: 9.1,
        exitReason: 'exitBand'
      },
      {
        entryDate: end,
        exitDate: null,
        direction: -1,
        daysHeld: 1,
        pnl: 5.6,
        exitReason: 'windowEnd'
      }
    ],
    ...overrides
  };
}

function pair(ticker1: string, ticker2: string, selected: boolean): BacktestPair {
  return {
    ticker1,
    ticker2,
    beta: 2.5,
    scanPValue: 0.0005,
    scanHalfLifeDays: 3.5,
    train: windowResult('2021-03-29', '2023-06-19', selected ? 2.1 : 0.4),
    holdout: windowResult('2023-06-20', '2024-01-26', selected ? 1.6 : 0.2),
    gates: {
      significance: true,
      trainSharpe: selected,
      trainDrawdown: true,
      trainWinRate: true,
      holdoutSharpe: selected
    },
    selected
  };
}

const COLLECTION: PairsBacktestCollection = {
  latest: {
    artefact: 'backtestReport',
    schemaVersion: 1,
    engineVersion: '0.1.0',
    runDate: '2024-01-26',
    generatedAt: '2026-07-22T09:30:00Z',
    scanRunDate: '2024-01-26',
    window: {
      start: '2021-01-04',
      end: '2024-01-26',
      splitDate: '2023-06-19',
      trainFraction: 0.8
    },
    assumptions: {
      lookbackDays: 60,
      entryZ: 2.0,
      exitZ: 0.5,
      stopZ: 3.5,
      maxHoldDays: 60,
      costBpsPerSide: 15.0,
      borrowBpsPerAnnum: 50.0
    },
    criteria: {
      maxPreselectionPValue: 0.01,
      trainMinSharpe: 1.5,
      trainMaxDrawdownPct: -15.0,
      trainMinWinRatePct: 45.0,
      holdoutMinSharpe: 1.2
    },
    pairs: [pair('AAA', 'BBB', true), pair('CCC', 'DDD', false)]
  },
  history: [
    {
      runDate: '2024-01-26',
      engineVersion: '0.1.0',
      schemaVersion: 1,
      generatedAt: '2026-07-22T09:30:00Z',
      receivedAt: '2026-07-22T09:31:00Z',
      sizeBytes: 4096
    }
  ]
};

async function seedSignedIn(): Promise<void> {
  await setMeta(db, 'authSession', {
    idToken: 'id-token',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    email: 'owner@example.com'
  });
}

function stubFetch(response: () => Response): ReturnType<typeof vi.fn> {
  const impl = vi.fn(async () => response());
  vi.stubGlobal('fetch', impl);
  return impl;
}

function renderAt(path: string): void {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the backtest surface', () => {
  it('renders the picker, the windows separate, and the stated gates', async () => {
    await seedSignedIn();
    const fetchImpl = stubFetch(
      () => new Response(JSON.stringify(COLLECTION), { status: 200 })
    );
    renderAt('/pairs/backtest');

    expect(await screen.findByRole('heading', { name: 'Backtest' })).toBeInTheDocument();
    // The first pair renders focused by default: its windows read
    // separately, train ending at the split and the holdout after it.
    expect(screen.getByText('2021-03-29 to 2023-06-19')).toBeInTheDocument();
    expect(screen.getByText('2023-06-20 to 2024-01-26')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Selected' })).toBeInTheDocument();
    expect(screen.getAllByText('met')).toHaveLength(5);
    // The trade list carries both windows, the open trade named honestly.
    expect(screen.getAllByText('long spread').length).toBeGreaterThan(0);
    expect(screen.getAllByText('open at end').length).toBeGreaterThan(0);
    const request = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toContain('/v1/pairs/artefacts/backtest');
  });

  it('focuses another pair through the query param', async () => {
    await seedSignedIn();
    stubFetch(() => new Response(JSON.stringify(COLLECTION), { status: 200 }));
    renderAt('/pairs/backtest');

    fireEvent.click(await screen.findByRole('button', { name: 'CCC–DDD' }));
    expect(await screen.findByRole('heading', { name: 'Not selected' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText('not met').length).toBeGreaterThan(0);
    });
  });

  it('renders the empty sleeve honestly', async () => {
    await seedSignedIn();
    stubFetch(
      () => new Response(JSON.stringify({ latest: null, history: [] }), { status: 200 })
    );
    renderAt('/pairs/backtest');
    expect(await screen.findByText('No backtest published yet')).toBeInTheDocument();
  });

  it('asks for sign-in without calling the API', async () => {
    const fetchImpl = stubFetch(() => new Response('{}', { status: 200 }));
    renderAt('/pairs/backtest');
    expect(await screen.findByText('Sign in to read the sleeve')).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces a failed read with a retry', async () => {
    await seedSignedIn();
    stubFetch(() => new Response('{}', { status: 500 }));
    renderAt('/pairs/backtest');
    expect(await screen.findByText('The sleeve could not be read')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the rail with the pairs sections on the sleeve routes', async () => {
    await seedSignedIn();
    await setMeta(db, 'pairsSeen', true);
    stubFetch(() => new Response(JSON.stringify(COLLECTION), { status: 200 }));
    renderAt('/pairs/backtest');

    await screen.findByRole('heading', { name: 'Backtest', level: 1 });
    expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '/pairs');
    const backtestLink = screen.getByRole('link', { name: 'Backtest' });
    expect(backtestLink).toHaveAttribute('aria-current', 'page');
  });
});
