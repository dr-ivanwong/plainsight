// @vitest-environment jsdom

// The settings root (frontend spec §3): the theme choice persisting to meta
// and applying to the document, the Owner's-lens switch, and the about group.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, getMeta, setMeta } from '../../db';
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

  it('offers sign-in while signed out, and everything still works without it', async () => {
    renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'Sync' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByText(/works on this device without it/)).toBeVisible();
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
