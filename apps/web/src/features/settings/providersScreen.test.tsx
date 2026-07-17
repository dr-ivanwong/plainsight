// @vitest-environment jsdom

// Settings → Providers (frontend spec §3): one row per key-owning provider
// with the pinned policy words, the key lifecycle against the device-local
// table, the probe chip behind Test, the read-only ladder, and the offline
// degradation that hides Test behind the quiet pill.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db, putCredential, setMeta } from '../../db';
import { routeTree } from '../../routeTree.gen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the providers screen', () => {
  it('is reachable from the settings root', async () => {
    renderAt('/settings');
    const link = await screen.findByRole('link', { name: 'Providers' });
    expect(link.getAttribute('href')).toBe('/settings/providers');
  });

  it('shows one row per key-owning provider, policy words and all', async () => {
    renderAt('/settings/providers');

    for (const name of ['Groq', 'DeepSeek', 'Gemini', 'Anthropic']) {
      expect(await screen.findByRole('region', { name })).toBeInTheDocument();
    }
    const deepseek = screen.getByRole('region', { name: 'DeepSeek' });
    expect(
      within(deepseek).getByText('May train on inputs; public documents only.')
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Anthropic' })).getByText('No-training endpoint.')
    ).toBeVisible();
  });

  it('shows the provisional ladder read-only, cheapest first', async () => {
    renderAt('/settings/providers');

    const ladder = await screen.findByRole('list', { name: 'Escalation order, cheapest first' });
    const items = within(ladder)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items[0]).toBe('Groq Llama 3.3 70B');
    expect(items.at(-1)).toBe('Claude Sonnet 5');
    expect(screen.getByText(/Keys stay in this device/)).toBeVisible();
  });

  it('adds a key, masks it, reveals it, and deletes it', async () => {
    renderAt('/settings/providers');

    fireEvent.click(await screen.findByRole('button', { name: 'Add the Groq key' }));
    fireEvent.change(screen.getByLabelText('Groq API key'), {
      target: { value: 'gsk-test-not-real' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      expect((await db.providerCredentials.get('groq'))?.key).toBe('gsk-test-not-real');
    });
    const groq = screen.getByRole('region', { name: 'Groq' });
    expect(await within(groq).findByLabelText('Key stored')).toBeVisible();

    fireEvent.click(within(groq).getByRole('button', { name: 'Reveal the Groq key' }));
    expect(within(groq).getByText('gsk-test-not-real')).toBeVisible();
    fireEvent.click(within(groq).getByRole('button', { name: 'Hide the Groq key' }));
    expect(within(groq).queryByText('gsk-test-not-real')).not.toBeInTheDocument();

    fireEvent.click(within(groq).getByRole('button', { name: 'Delete the Groq key' }));
    await waitFor(async () => {
      expect(await db.providerCredentials.get('groq')).toBeUndefined();
    });
    expect(await within(groq).findByRole('button', { name: 'Add the Groq key' })).toBeVisible();
  });

  it('tests a key and wears the probe verdict as a quiet chip', async () => {
    await putCredential(db, { providerId: 'anthropic', key: 'sk-test-not-real' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 }))
    );
    renderAt('/settings/providers');

    const anthropic = await screen.findByRole('region', { name: 'Anthropic' });
    fireEvent.click(within(anthropic).getByRole('button', { name: 'Test the Anthropic key' }));

    expect(await within(anthropic).findByText('Direct')).toBeVisible();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'sk-test-not-real' })
      })
    );
  });

  it('reads a turned-away key as failed', async () => {
    await putCredential(db, { providerId: 'gemini', key: 'bad-key' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }))
    );
    renderAt('/settings/providers');

    const gemini = await screen.findByRole('region', { name: 'Gemini' });
    fireEvent.click(within(gemini).getByRole('button', { name: 'Test the Gemini key' }));

    expect(await within(gemini).findByText('Failed')).toBeVisible();
  });

  it('hides the test behind the quiet pill while offline', async () => {
    await putCredential(db, { providerId: 'groq', key: 'gsk-test-not-real' });
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderAt('/settings/providers');

    const groq = await screen.findByRole('region', { name: 'Groq' });
    expect(screen.getByText('Offline')).toBeVisible();
    expect(
      within(groq).queryByRole('button', { name: 'Test the Groq key' })
    ).not.toBeInTheDocument();
    // Everything device-local still works offline.
    expect(within(groq).getByRole('button', { name: 'Reveal the Groq key' })).toBeVisible();
  });
});
