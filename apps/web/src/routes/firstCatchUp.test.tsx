// @vitest-environment jsdom

// The library's first catch-up (frontend spec §3, the library screen): a signed-in device
// that has never synced must not claim a true-empty library while its first
// pull could still land. The placeholder rows hold the screen until the run
// settles; a failure serves the cache (main plan §12.9, catch-up mode).
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db, setMeta } from '../db';
import { routeTree } from '../routeTree.gen';
import { appScheduler } from '../sync/useSync';

beforeEach(async () => {
  await db.delete();
  await db.open();
  appScheduler.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string): void {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
}

const session = {
  idToken: 'x.y.z',
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 60 * 60 * 1000,
  email: 'ivan@example.com'
};

describe("the library's first catch-up", () => {
  it('holds placeholder rows while the first pull is in flight', async () => {
    // A pull that never settles keeps the catch-up state observable.
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    await setMeta(db, 'authSession', session);
    renderAt('/');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Catching up with your library.'
    );
    expect(screen.queryByRole('button', { name: 'Add a company' })).toBeNull();
  });

  it('serves the cache once the first pull fails: catch-up, not a wall', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await setMeta(db, 'authSession', session);
    renderAt('/');

    expect(
      await screen.findByRole('heading', { name: 'Read financial statements like an owner' })
    ).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('signed out, the true-empty hero shows as it always has', async () => {
    renderAt('/');

    expect(
      await screen.findByRole('heading', { name: 'Read financial statements like an owner' })
    ).toBeVisible();
  });

  it('a device that has synced before treats empty as empty', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    await setMeta(db, 'authSession', session);
    await setMeta(db, 'lastSyncedAt', '2026-07-18T09:00:00.000Z');
    renderAt('/');

    expect(
      await screen.findByRole('heading', { name: 'Read financial statements like an owner' })
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
