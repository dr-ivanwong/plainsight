// @vitest-environment jsdom

// Data & storage (frontend spec §3): export stamping its date, import through
// the dry-run sheet, storage status, one-tap sample removal, the quarantine
// list, and the type-the-name danger zone.
import 'fake-indexeddb/auto';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompany, db, getMeta, setMeta, upsertStatement } from '../../db';
import { routeTree } from '../../routeTree.gen';
import { company, incomeStatement, T0 } from '../../test/builders';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

function renderAt(path = '/settings/data') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

const exportFileWith = (data: Record<string, unknown>) =>
  JSON.stringify({
    format: 'plainsight-export',
    formatVersion: 1,
    exportedAt: T0,
    appVersion: '0.0.0',
    data: {
      companies: [],
      statements: [],
      prices: [],
      theses: [],
      thesisVersions: [],
      flagDismissals: [],
      settings: {},
      ...data
    }
  });

const chooseFile = (text: string) => {
  const input = screen.getByLabelText('Choose an export file');
  fireEvent.change(input, {
    target: { files: [new File([text], 'library.json', { type: 'application/json' })] }
  });
};

describe('data and storage', () => {
  it('exports the library and stamps the date', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    renderAt();

    expect(await screen.findByText('Never exported from this device.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Export the library' }));

    await waitFor(async () => {
      expect(await getMeta(db, 'lastExportAt')).toBeDefined();
    });
    expect(await screen.findByText(/Last export \d{4}-\d{2}-\d{2}\./)).toBeVisible();
  });

  it('imports through the dry-run sheet, writing nothing before the choice', async () => {
    renderAt();
    await screen.findByRole('heading', { name: 'Data & storage' });

    chooseFile(
      exportFileWith({
        companies: [company({ id: 'imported', name: 'Imported Co' })],
        statements: [incomeStatement({ companyId: 'imported' })]
      })
    );

    const sheet = await screen.findByRole('dialog', { name: 'Import' });
    expect(within(sheet).getByText('1 company')).toBeVisible();
    expect(within(sheet).getByText('1 fiscal year')).toBeVisible();
    expect(await db.companies.count()).toBe(0);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Merge' }));
    await waitFor(async () => {
      expect((await db.companies.get('imported'))?.name).toBe('Imported Co');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('turns a newer export away with the pinned message', async () => {
    renderAt();
    await screen.findByRole('heading', { name: 'Data & storage' });

    chooseFile(JSON.stringify({ format: 'plainsight-export', formatVersion: 2 }));

    const sheet = await screen.findByRole('dialog', { name: 'Import' });
    expect(
      within(sheet).getByText(/comes from a newer Plainsight\. Update the app first\./)
    ).toBeVisible();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('removes sample data in one action and leaves the rest', async () => {
    const { loadSampleData } = await import('../library/loadSamples');
    await loadSampleData(db);
    const real = await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    const { updatedAt: _stamp, ...write } = incomeStatement({ companyId: real.id });
    await upsertStatement(db, write);

    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove sample data' }));

    await waitFor(async () => {
      expect(await db.companies.count()).toBe(1);
    });
    expect(await db.statements.count()).toBe(1);
    expect(await db.prices.count()).toBe(0);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove sample data' })).not.toBeInTheDocument();
    });
  });

  it('lists quarantined records and discards them one by one', async () => {
    await db.quarantine.add({
      table: 'companies',
      raw: { broken: true },
      reason: 'currency: expected an ISO 4217 code like USD',
      quarantinedAt: T0
    });

    renderAt();
    expect(await screen.findByText(/expected an ISO 4217 code/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(async () => {
      expect(await db.quarantine.count()).toBe(0);
    });
    await waitFor(() => {
      expect(screen.queryByText(/expected an ISO 4217 code/)).not.toBeInTheDocument();
    });
  });

  it('arms the wipe only on the app name, then wipes to a true first launch', async () => {
    await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    renderAt();

    const wipe = await screen.findByRole('button', { name: 'Wipe everything' });
    expect(wipe).toBeDisabled();

    const confirm = screen.getByLabelText('Type Plainsight to confirm');
    fireEvent.change(confirm, { target: { value: 'plainsight' } });
    expect(wipe).toBeDisabled();

    fireEvent.change(confirm, { target: { value: 'Plainsight' } });
    expect(wipe).toBeEnabled();
    fireEvent.click(wipe);

    expect(
      await screen.findByRole('heading', { name: 'Read financial statements like an owner' })
    ).toBeVisible();
    expect(await db.companies.count()).toBe(0);
    expect(await getMeta(db, 'onboardingDone')).toBeUndefined();
  });

  it('says so when the browser does not report storage', async () => {
    renderAt();
    expect(await screen.findByText('This browser does not report storage.')).toBeVisible();
  });

  it('shows persistence and the usage meter when the browser reports them', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => true,
        persist: async () => true,
        estimate: async () => ({ usage: 1_200_000, quota: 120_000_000_000 })
      }
    });

    renderAt();
    expect(await screen.findByText(/Persisted: this browser has promised/)).toBeVisible();
    expect(screen.getByText('1.2 MB used of 120 GB')).toBeVisible();
    expect(screen.getByRole('meter', { name: 'Storage used' })).toBeVisible();
  });
});
