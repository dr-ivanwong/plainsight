// @vitest-environment jsdom

// The Phase 1 route skeleton (frontend spec §1.1): every route renders, the
// search params are typed contracts, and unrecognised values degrade to the
// plain screen instead of an error. The library route reads the app database,
// so IndexedDB must exist before the route tree loads.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { routeTree } from '../routeTree.gen';

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the route skeleton', () => {
  it('serves the library at the root', async () => {
    await renderAt('/');
    expect(
      await screen.findByRole('heading', { name: 'Read financial statements like an owner' })
    ).toBeVisible();
  });

  it('serves the dashboard, with a way home when the company does not exist', async () => {
    await renderAt('/company/ghost');
    expect(
      await screen.findByRole('heading', { name: 'No company at this address' })
    ).toBeVisible();
  });

  it('drops an unrecognised metric param instead of crashing', async () => {
    await renderAt('/company/ghost?metric=ebitdaMagic');
    expect(
      await screen.findByRole('heading', { name: 'No company at this address' })
    ).toBeVisible();
  });

  it('serves data entry, with a way home when the company does not exist', async () => {
    await renderAt('/company/ghost/entry');
    expect(
      await screen.findByRole('heading', { name: 'No company at this address' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the library' })).toBeVisible();
  });

  it('degrades malformed deep-link params instead of crashing', async () => {
    await renderAt('/company/ghost/entry?stmt=income&fy=2024&focus=ebitda');
    expect(
      await screen.findByRole('heading', { name: 'No company at this address' })
    ).toBeVisible();
  });

  it('serves the settings root and the data screen', async () => {
    await renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();

    await renderAt('/settings/data');
    expect(await screen.findByRole('heading', { name: 'Data & storage' })).toBeVisible();
  });

  it('serves the thesis editor, with a way home when the company does not exist', async () => {
    await renderAt('/company/ghost/thesis');
    expect(
      await screen.findByRole('heading', { name: 'No company at this address' })
    ).toBeVisible();
  });

  it('serves compare, prompting while the library is short', async () => {
    await renderAt('/compare');
    expect(await screen.findByRole('heading', { name: 'Compare' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a company' })).toBeVisible();
  });

  it('degrades a malformed ids param instead of crashing', async () => {
    await renderAt('/compare?ids=,,ghost,,');
    expect(await screen.findByRole('heading', { name: 'Compare' })).toBeVisible();
  });

  it('offers a way home from an address that matches nothing', async () => {
    await renderAt('/nowhere/at/all');
    expect(await screen.findByRole('heading', { name: 'Nothing at this address' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the library' })).toBeVisible();
  });
});
