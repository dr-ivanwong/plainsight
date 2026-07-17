// @vitest-environment jsdom

// The thesis editor (frontend spec §3): four sections with their prompt
// questions as placeholders, keystrokes local, the draft committing on blur
// and after the keyboard rests, with the quiet ticker the only feedback.
// Versions are explicit, append-only, optionally carrying the financials
// snapshot; `?history=1` lists them with their word-count movement.
import 'fake-indexeddb/auto';
import type { EntryValue } from '@plainsight/calc-engine';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createCompany,
  db,
  saveThesisVersion,
  setMeta,
  upsertStatement,
  type CompanyRecord,
  type ThesisSections
} from '../../db';
import { routeTree } from '../../routeTree.gen';

const e = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'Apple Inc.', currency: 'USD' });

async function seedYear(companyId: string): Promise<void> {
  await upsertStatement(db, {
    companyId,
    fy: 'FY2024',
    statement: 'income',
    endDate: '2024-09-28',
    entryScale: 'ones',
    values: { revenue: e(100_000), netIncome: e(20_000) },
    provenance: { source: 'manual', recordedAt: '2026-07-11T09:30:00Z' }
  });
}

const words = (business: string): ThesisSections => ({
  business,
  moat: '',
  valuation: '',
  kills: ''
});

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
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saved · just now')
    );
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

  it('saves versions with the financials snapshot behind the toggle', async () => {
    const company = await seedCompany();
    await seedYear(company.id);
    renderAt(`/company/${company.id}/thesis`);

    const business = await screen.findByRole('textbox', { name: 'Business' });
    fireEvent.change(business, { target: { value: 'Sells hardware people queue for.' } });

    const save = screen.getByRole('button', { name: 'Save a version' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(async () => {
      expect(await db.thesisVersions.where('companyId').equals(company.id).count()).toBe(1);
    });
    const [first] = await db.thesisVersions.where('companyId').equals(company.id).toArray();
    expect(first?.sections.business).toBe('Sells hardware people queue for.');
    expect(first?.financialsSnapshot?.years).toHaveLength(1);
    expect(first?.financialsSnapshot?.years[0]?.values.revenue).toEqual(e(100_000));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Version saved · just now')
    );

    // The same save with the toggle off carries no snapshot.
    fireEvent.click(screen.getByRole('switch', { name: "Attach today's financials" }));
    fireEvent.click(save);
    await waitFor(async () => {
      expect(await db.thesisVersions.where('companyId').equals(company.id).count()).toBe(2);
    });
    const rows = await db.thesisVersions.where('companyId').equals(company.id).sortBy('id');
    expect(rows[1]?.financialsSnapshot).toBeUndefined();
  });

  it('keeps saving disabled for an unwritten thesis, and hides the toggle without data', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis`);

    const save = await screen.findByRole('button', { name: 'Save a version' });
    await waitFor(() => expect(save).toBeDisabled());
    expect(
      screen.queryByRole('switch', { name: "Attach today's financials" })
    ).not.toBeInTheDocument();
  });

  it('lists versions newest first with their word-count movement', async () => {
    const company = await seedCompany();
    await saveThesisVersion(db, { companyId: company.id, sections: words('one two three') });
    await saveThesisVersion(db, {
      companyId: company.id,
      sections: words('one two three four five'),
      financialsSnapshot: {
        years: [
          {
            fy: 'FY2024',
            endDate: '2024-09-28',
            currency: 'USD',
            entryScale: 'ones',
            values: { revenue: e(100_000) }
          }
        ]
      }
    });
    renderAt(`/company/${company.id}/thesis?history=1`);

    const sheet = await screen.findByRole('dialog');
    const rows = await within(sheet).findAllByRole('button', { name: /words/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('+2 words');
    expect(rows[0]).toHaveTextContent('financials');
    expect(rows[1]).toHaveTextContent('3 words');
  });

  it('opens a version read-only, exactly as saved', async () => {
    const company = await seedCompany();
    await saveThesisVersion(db, {
      companyId: company.id,
      sections: words('The original words, kept.'),
      financialsSnapshot: {
        years: [
          {
            fy: 'FY2024',
            endDate: '2024-09-28',
            currency: 'USD',
            entryScale: 'ones',
            values: { revenue: e(100_000) }
          }
        ],
        price: { amountMinor: 21_150, currency: 'USD', asOf: '2026-07-10' }
      }
    });
    renderAt(`/company/${company.id}/thesis?history=1`);

    const sheet = await screen.findByRole('dialog');
    fireEvent.click(await within(sheet).findByRole('button', { name: /words/ }));

    expect(within(sheet).getByText('The original words, kept.')).toBeVisible();
    expect(within(sheet).getByText(/financials snapshot attached, 1 year and the price/)).toBeVisible();
    expect(within(sheet).queryAllByRole('textbox')).toHaveLength(0);

    fireEvent.click(within(sheet).getByRole('button', { name: '‹ All versions' }));
    expect(within(sheet).getByRole('button', { name: /words/ })).toBeVisible();
  });

  it('meets an empty history calmly', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis?history=1`);

    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(/No versions yet/)).toBeVisible();
  });

  it('remembers the serif choice', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/thesis`);

    fireEvent.click(await screen.findByRole('switch', { name: 'Serif text' }));

    await waitFor(async () => {
      expect((await db.meta.get('thesisSerif'))?.value).toBe(true);
    });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Serif text' })).toBeChecked()
    );
  });
});
