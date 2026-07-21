// @vitest-environment jsdom

// First run (frontend spec §3): the true-first-launch redirect, three
// hard-capped panes, the skip escape, and pane three landing on the library
// in the corresponding state.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, getMeta, setMeta } from '../../db';
import { routeTree } from '../../routeTree.gen';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

const PANE_ONE = 'Read financial statements like an owner';

describe('first run', () => {
  it('redirects a true first launch from the root to the welcome', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: PANE_ONE })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeVisible();
  });

  it('walks exactly three panes', async () => {
    renderAt('/onboarding');
    await screen.findByRole('heading', { name: PANE_ONE });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Where your data lives' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Choose your start' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a company' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'See it with sample data' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import a file' })).toBeVisible();
  });

  it('pane two states the source-of-truth contract, not the superseded one', async () => {
    renderAt('/onboarding');
    await screen.findByRole('heading', { name: PANE_ONE });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Where your data lives' });

    // The current contract (main plan section 12.9): the app works offline
    // against a device copy, the durable copy lives behind sign-in, and
    // export is portability. This pin exists because the previous copy
    // ("no account and no server") outlived the architecture by a day.
    const body = screen.getByText(/works offline against a copy kept on this device/);
    expect(body).toHaveTextContent(/durable home on the server/);
    expect(body).toHaveTextContent(/exports the whole library/);
    expect(body).not.toHaveTextContent(/no account and no server/);
    expect(body).not.toHaveTextContent(/nothing leaves without you/i);
  });

  it('choosing to import a file carries the intent through the add sheet to the upload picker', async () => {
    renderAt('/onboarding');
    await screen.findByRole('heading', { name: PANE_ONE });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import a file' }));

    // A filing needs a company shell first: the add sheet opens.
    const sheet = await screen.findByRole('dialog', { name: 'Add a company' });
    fireEvent.change(within(sheet).getByLabelText(/Name/), {
      target: { value: 'Wesfarmers' }
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add company' }));

    // The new company lands on data entry with the upload picker already open.
    expect(await screen.findByRole('dialog', { name: 'Import a file' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Data entry' })).toBeVisible();
  });

  it('skip marks the welcome done and lands on the empty library', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add a company' })).toBeVisible();
    expect(await getMeta(db, 'onboardingDone')).toBe(true);
  });

  it('choosing to add a company lands on the library with the sheet open', async () => {
    renderAt('/onboarding');
    await screen.findByRole('heading', { name: PANE_ONE });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add a company' }));

    expect(await screen.findByRole('dialog', { name: 'Add a company' })).toBeVisible();
    expect(await getMeta(db, 'onboardingDone')).toBe(true);
  });

  it('never redirects once the flag is set', async () => {
    await setMeta(db, 'onboardingDone', true);
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('the sample choice loads the sample set and lands on the populated library', async () => {
    renderAt('/onboarding');
    await screen.findByRole('heading', { name: PANE_ONE });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'See it with sample data' }));

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeVisible();
    expect(await screen.findByRole('link', { name: /CSL, sample data/ })).toBeVisible();
    expect(await getMeta(db, 'onboardingDone')).toBe(true);
    expect(await db.companies.count()).toBe(5);
  });

  it('stays reachable by address after completion', async () => {
    await setMeta(db, 'onboardingDone', true);
    renderAt('/onboarding');
    expect(await screen.findByRole('heading', { name: PANE_ONE })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });
});
