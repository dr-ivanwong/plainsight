// @vitest-environment jsdom

// The settings root (frontend spec §3): the theme choice persisting to meta
// and applying to the document, the Owner's-lens switch, and the about group.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db, getMeta, setMeta } from '../../db';
import { routeTree } from '../../routeTree.gen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
  delete document.documentElement.dataset.theme;
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the settings root', () => {
  it('shows the groups with their rows', async () => {
    renderAt('/settings');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    expect(screen.getByRole('switch', { name: "Owner's lens" })).toBeChecked();
    expect(screen.getByRole('link', { name: /Data & storage/ }).getAttribute('href')).toBe(
      '/settings/data'
    );
    expect(screen.getByText('0.0.0')).toBeVisible();
    expect(screen.getByRole('link', { name: /Replay the welcome/ }).getAttribute('href')).toBe(
      '/onboarding'
    );
  });

  it('carries the export nudge on the Data & storage row when a copy is overdue', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    await setMeta(db, 'lastExportAt', '2026-05-01T00:00:00.000Z');
    renderAt('/settings');
    expect(
      await screen.findByText('More than 30 days since the last export.')
    ).toBeVisible();
  });

  it('keeps the Data & storage row quiet while the library is empty', async () => {
    renderAt('/settings');
    await screen.findByRole('heading', { name: 'Settings' });
    // Nothing to copy, so nothing to nudge about, even with no export ever.
    expect(screen.queryByText(/No export taken/)).not.toBeInTheDocument();
  });

  it('keeps the Data & storage row quiet while the copy is fresh', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    await setMeta(db, 'lastExportAt', new Date().toISOString());
    renderAt('/settings');
    await screen.findByRole('heading', { name: 'Settings' });
    expect(screen.queryByText(/More than 30 days/)).not.toBeInTheDocument();
  });

  it('offers sign-in while signed out, with the source-of-truth wording', async () => {
    renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'Sync' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
    // The note tells the §12.9 truth: the device holds a working copy, the
    // durable copy is behind sign-in. The old "nothing needs it" soft-pedal
    // must not resurface.
    const note = screen.getByText(/works on this device's copy without it/);
    expect(note).toHaveTextContent(/durable copy on the server/);
    expect(note).not.toHaveTextContent(/keep each other in step/);
  });

  it('shows who is signed in and signs out to the signed-out row', async () => {
    await setMeta(db, 'authSession', {
      idToken: 'x.y.z',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60 * 60 * 1000,
      email: 'ivan@example.com'
    });
    renderAt('/settings');
    expect(await screen.findByText('ivan@example.com')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(async () => {
      expect(await getMeta(db, 'authSession')).toBeUndefined();
    });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  it('surfaces writes waiting to sync on the signed-in row', async () => {
    await setMeta(db, 'authSession', {
      idToken: 'x.y.z',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60 * 60 * 1000,
      email: 'ivan@example.com'
    });
    const first = await createCompany(db, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    renderAt('/settings');
    expect(await screen.findByText(/1 change waiting to sync/)).toBeVisible();

    const second = await createCompany(db, {
      name: 'Microsoft Corporation',
      currency: 'USD',
      sector: 'Technology'
    });
    expect(await screen.findByText(/2 changes waiting to sync/)).toBeVisible();

    // The server accepts both (their shadows match); the row goes quiet.
    await db.syncState.bulkPut([
      { recordKey: `company#${first.id}`, lastLamport: 1, fingerprint: first.updatedAt },
      { recordKey: `company#${second.id}`, lastLamport: 2, fingerprint: second.updatedAt }
    ]);
    await waitFor(() => {
      expect(screen.queryByText(/waiting to sync/)).toBeNull();
    });
  });

  it('persists a theme choice and stamps the document, and auto hands back to the system', async () => {
    renderAt('/settings');

    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(await getMeta(db, 'theme')).toBe('dark');

    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBeUndefined();
    });
    expect(await getMeta(db, 'theme')).toBe('auto');
  });

  it('applies the stored theme on any screen, not just settings', async () => {
    await setMeta(db, 'theme', 'dark');

    renderAt('/');
    await screen.findByRole('heading', { name: 'Library' });
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  it('turns the education layer off through the lens switch', async () => {
    renderAt('/settings');

    fireEvent.click(await screen.findByRole('switch', { name: "Owner's lens" }));
    await waitFor(async () => {
      expect(await getMeta(db, 'educationLayerOff')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: "Owner's lens" })).not.toBeChecked();
    });

    fireEvent.click(screen.getByRole('switch', { name: "Owner's lens" }));
    await waitFor(async () => {
      expect(await getMeta(db, 'educationLayerOff')).toBe(false);
    });
  });
});
