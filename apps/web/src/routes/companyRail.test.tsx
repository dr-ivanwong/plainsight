// @vitest-environment jsdom

// The desktop section rail (frontend spec §1.2 amendment, main plan §12.10):
// inside a company the three sections and the Library link render as one
// labelled nav with the active section marked; outside a company the rail
// does not exist. Width behaviour is CSS (≥1200px) and is verified in the
// browser, not here.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db, setMeta } from '../db';
import { routeTree } from '../routeTree.gen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

function renderAt(path: string): void {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
}

describe('the company section rail', () => {
  it('offers the sections and the way home, with the current one marked', async () => {
    const company = await createCompany(db, {
      name: 'Wesfarmers',
      currency: 'AUD',
      sector: 'Retail'
    });
    renderAt(`/company/${company.id}`);

    const rail = await screen.findByRole('navigation', { name: 'Company sections' });
    expect(within(rail).getByRole('link', { name: '‹ Library' }).getAttribute('href')).toBe('/');
    expect(await within(rail).findByText('Wesfarmers')).toBeDefined();
    expect(
      within(rail).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')
    ).toBe('page');
    expect(
      within(rail).getByRole('link', { name: 'Data entry' }).getAttribute('href')
    ).toBe(`/company/${company.id}/entry`);
    expect(
      within(rail).getByRole('link', { name: 'Thesis' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('marks the thesis section on the thesis route', async () => {
    const company = await createCompany(db, {
      name: 'Wesfarmers',
      currency: 'AUD',
      sector: 'Retail'
    });
    renderAt(`/company/${company.id}/thesis`);

    const rail = await screen.findByRole('navigation', { name: 'Company sections' });
    expect(
      within(rail).getByRole('link', { name: 'Thesis' }).getAttribute('aria-current')
    ).toBe('page');
    expect(
      within(rail).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('does not exist outside a company', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Company sections' })).toBeNull();
  });
});
