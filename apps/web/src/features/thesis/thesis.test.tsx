// @vitest-environment jsdom

// The thesis editor (frontend spec §3): four sections with their prompt
// questions as placeholders, keystrokes local, the draft committing on blur
// and after the keyboard rests, with the quiet ticker the only feedback.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db, setMeta, type CompanyRecord } from '../../db';
import { routeTree } from '../../routeTree.gen';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'Apple Inc.', currency: 'USD' });

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the thesis editor', () => {
  it('offers a way home when the company does not exist', async () => {
    renderAt('/company/ghost/thesis');
    expect(
      await screen.findByRole('heading', { name: 'No company at this address' })
    ).toBeVisible();
  });

  it('shows the four sections with their prompt questions as placeholders', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis`);

    expect(await screen.findByRole('heading', { name: 'Thesis' })).toBeVisible();
    for (const label of ['Business', 'Moat', 'Valuation', 'What kills it']) {
      expect(screen.getByRole('textbox', { name: label })).toBeVisible();
    }
    expect(
      screen.getByPlaceholderText('What keeps competitors from taking these economics?')
    ).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Serif text' })).not.toBeChecked();
  });

  it('commits the draft on blur and says so quietly', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis`);

    const business = await screen.findByRole('textbox', { name: 'Business' });
    fireEvent.change(business, { target: { value: 'Sells hardware people queue for.' } });
    fireEvent.blur(business);

    await waitFor(async () => {
      const row = await db.theses.get(company.id);
      expect(row?.sections.business).toBe('Sells hardware people queue for.');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved · just now');
  });

  it('commits the draft once the keyboard rests, without a blur', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis`);

    const moat = await screen.findByRole('textbox', { name: 'Moat' });
    fireEvent.change(moat, { target: { value: 'Ecosystem switching costs.' } });

    await waitFor(
      async () => {
        const row = await db.theses.get(company.id);
        expect(row?.sections.moat).toBe('Ecosystem switching costs.');
      },
      { timeout: 3_000 }
    );
  });

  it('opens an existing thesis where it was left', async () => {
    const company = await seedCompany();
    await db.theses.put({
      companyId: company.id,
      sections: {
        business: 'Sells sugared water with a moat.',
        moat: 'The brand.',
        valuation: '',
        kills: ''
      },
      updatedAt: '2026-07-11T09:30:00Z'
    });
    renderAt(`/company/${company.id}/thesis`);

    expect(await screen.findByRole('textbox', { name: 'Business' })).toHaveValue(
      'Sells sugared water with a moat.'
    );
    expect(screen.getByRole('textbox', { name: 'Moat' })).toHaveValue('The brand.');
    // Untouched sections still teach through their placeholder.
    expect(
      screen.getByPlaceholderText('What would have to be true for this thesis to be wrong?')
    ).toHaveValue('');
  });

  it('remembers the serif choice', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis`);

    fireEvent.click(await screen.findByRole('switch', { name: 'Serif text' }));

    await waitFor(async () => {
      expect((await db.meta.get('thesisSerif'))?.value).toBe(true);
    });
    expect(screen.getByRole('switch', { name: 'Serif text' })).toBeChecked();
  });
});
