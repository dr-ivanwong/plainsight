// @vitest-environment jsdom

// The desktop navigation rail (frontend spec §1.2 amendment, main plan
// §12.11): persistent on every screen, with the destinations up top,
// Compare joining at two companies, and the open company's sections
// beneath its name. Width behaviour is CSS (≥1200px) and is verified in
// the browser, not here.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db } from '../db';
import { routeTree } from '../routeTree.gen';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderAt(path: string): void {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
}

describe('the navigation rail', () => {
  it('carries the destinations, and Compare joins at two companies', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD', sector: 'Retail' });
    renderAt('/');

    const rail = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(rail).getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBe(
      'page'
    );
    expect(within(rail).getByRole('link', { name: 'Settings' })).toBeDefined();
    expect(within(rail).queryByRole('link', { name: 'Compare' })).toBeNull();

    await createCompany(db, { name: 'Woolworths', currency: 'AUD', sector: 'Retail' });
    await waitFor(() => {
      expect(within(rail).getByRole('link', { name: 'Compare' })).toBeDefined();
    });
  });

  it('adds the open company and its sections beneath the destinations', async () => {
    const company = await createCompany(db, {
      name: 'Wesfarmers',
      currency: 'AUD',
      sector: 'Retail'
    });
    renderAt(`/company/${company.id}`);

    const rail = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(rail).findByText('Wesfarmers')).toBeDefined();
    expect(within(rail).getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBeNull();
    expect(
      within(rail).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')
    ).toBe('page');
    expect(within(rail).getByRole('link', { name: 'Data entry' }).getAttribute('href')).toBe(
      `/company/${company.id}/entry`
    );
    expect(within(rail).getByRole('link', { name: 'Thesis' }).getAttribute('aria-current')).toBeNull();
  });

  it('lights Settings on its sub-screens too, with no company group in sight', async () => {
    renderAt('/settings/data');

    const rail = await screen.findByRole('navigation', { name: 'Main' });
    await waitFor(() => {
      expect(
        within(rail).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')
      ).toBe('page');
    });
    expect(within(rail).queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

});
