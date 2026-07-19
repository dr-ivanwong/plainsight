// @vitest-environment jsdom

// The company dashboard (frontend spec §3): the twelve-card budget, pinned
// degenerate phrases, insufficient-data deep links, and the collapsing
// valuation cards.
import 'fake-indexeddb/auto';
import { METRIC_IDS, METRICS, type EntryValue, type FyLabel } from '@plainsight/calc-engine';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createCompany,
  db,
  putPrice,
  setMeta,
  upsertStatement,
  type CompanyRecord,
  type StatementWrite
} from '../../db';
import { routeTree } from '../../routeTree.gen';
import { DASHBOARD_SECTIONS } from './sections';

const e = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

const MANUAL = { source: 'manual', recordedAt: '2026-07-11T09:30:00Z' } as const;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'Apple Inc.', currency: 'USD', sector: 'Technology' });

const yearWrite = (
  companyId: string,
  statement: StatementWrite['statement'],
  values: StatementWrite['values'],
  fy: FyLabel = 'FY2024'
): StatementWrite => ({
  companyId,
  fy,
  statement,
  endDate: '2024-09-28',
  entryScale: 'ones',
  values,
  provenance: MANUAL
});

async function seedFullYear(companyId: string, equityMinor = 40_000): Promise<void> {
  await upsertStatement(
    db,
    yearWrite(companyId, 'income', {
      revenue: e(100_000),
      costOfRevenue: e(60_000),
      operatingIncome: e(20_000),
      interestExpense: e(1_000),
      pretaxIncome: e(19_000),
      taxExpense: e(4_000),
      netIncome: e(15_000),
      dilutedShares: e(10_000)
    })
  );
  await upsertStatement(
    db,
    yearWrite(companyId, 'balance', {
      cashAndEquivalents: e(5_000),
      currentAssets: e(30_000),
      totalAssets: e(100_000),
      currentLiabilities: e(15_000),
      shortTermDebt: e(2_000),
      longTermDebt: e(18_000),
      totalLiabilities: e(60_000),
      totalEquity: e(equityMinor)
    })
  );
  await upsertStatement(
    db,
    yearWrite(companyId, 'cashflow', {
      operatingCashFlow: e(18_000),
      capex: e(6_000)
    })
  );
}

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the company dashboard', () => {
  it('renders the twelve pinned cards for a complete year with a price', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await putPrice(db, { companyId: company.id, amountMinor: 30, currency: 'USD', asOf: '2026-07-10' });

    renderAt(`/company/${company.id}`);

    expect(await screen.findByRole('heading', { name: 'Apple Inc.' })).toBeVisible();
    expect(screen.getByText('Technology · FY2024 · USD')).toBeVisible();

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(12);
    });
    expect(within(screen.getByRole('article', { name: 'Gross margin' })).getByText('40.0%')).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'Current ratio' })).getByText('2.00')).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'ROE' })).getByText('37.5%')).toBeVisible();
    expect(
      within(screen.getByRole('article', { name: 'Interest coverage' })).getByText('20.0×')
    ).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'P/E' })).getByText('20.00')).toBeVisible();
    expect(screen.queryByText('FCF margin')).not.toBeInTheDocument();
    expect(screen.queryByText('Earnings yield')).not.toBeInTheDocument();
  });

  it('holds the section map to the dictionary card flags, in order', () => {
    expect(DASHBOARD_SECTIONS.flatMap((section) => section.ids)).toEqual(
      METRIC_IDS.filter((id) => METRICS[id].card)
    );
  });

  it('groups the cards under the five quiet section labels', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);

    await screen.findByRole('article', { name: 'Gross margin' });
    const metrics = screen.getByRole('region', { name: 'Metrics' });
    const labels = within(metrics)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(labels).toEqual(['Profitability', 'Returns', 'Safety', 'Cash', 'Valuation']);
  });

  it('collapses the two valuation cards into one enter-price card until a price exists', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);

    expect(await screen.findByRole('article', { name: "Enter today's price" })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'P/E' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'FCF yield' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(11);
  });

  it('expands valuation in place when the price is saved', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);
    const card = await screen.findByRole('article', { name: "Enter today's price" });
    fireEvent.change(within(card).getByLabelText('Price'), { target: { value: '0.30' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));

    const pe = await screen.findByRole('article', { name: 'P/E' });
    expect(within(pe).getByText('20.00')).toBeVisible();
    expect(within(pe).getByText(/as of \d{4}-\d{2}-\d{2}/)).toBeVisible();
  });

  it('deep-links an insufficient card to the first missing number', async () => {
    const company = await seedCompany();
    await upsertStatement(
      db,
      yearWrite(company.id, 'income', {
        revenue: e(100_000),
        netIncome: e(15_000)
      })
    );

    renderAt(`/company/${company.id}`);

    const roe = await screen.findByRole('article', { name: 'ROE' });
    expect(within(roe).getByText('Add the 1 missing number')).toBeVisible();
    const link = roe.closest('a');
    expect(link?.getAttribute('href')).toContain('stmt=balance');
    expect(link?.getAttribute('href')).toContain('fy=FY2024');
    expect(link?.getAttribute('href')).toContain('focus=totalEquity');
  });

  it('speaks the pinned phrase for a degenerate denominator', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id, -2_000);

    renderAt(`/company/${company.id}`);

    const roe = await screen.findByRole('article', { name: 'ROE' });
    expect(within(roe).getByText('n/m: negative equity')).toBeVisible();
  });

  it('points an empty company at data entry', async () => {
    const company = await seedCompany();

    renderAt(`/company/${company.id}`);

    expect(await screen.findByText(/No statements yet/)).toBeVisible();
    const link = screen.getByRole('link', { name: 'Add the first year' });
    expect(link.getAttribute('href')).toBe(`/company/${company.id}/entry`);
  });

  it('offers the thesis doorway beneath the cards', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);

    const doorway = await screen.findByRole('link', { name: /Thesis/ });
    expect(doorway.getAttribute('href')).toBe(`/company/${company.id}/thesis`);
  });

  it('draws sparklines and the five-year delta once the history supports them', async () => {
    const company = await seedCompany();
    // Six labelled years: the delta chip compares the latest against five labels prior.
    for (let offset = 0; offset < 6; offset += 1) {
      const year = 2019 + offset;
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'income',
          { revenue: e(100_000), costOfRevenue: e(60_000 - offset * 1_000) },
          `FY${year}` as FyLabel
        )
      );
    }

    renderAt(`/company/${company.id}`);

    const gross = await screen.findByRole('article', { name: 'Gross margin' });
    expect(within(gross).getByText('45.0%')).toBeVisible();
    expect(within(gross).getByText(/5\.0 pp/)).toHaveAttribute(
      'aria-label',
      'up 5.0 percentage points, FY2019 to FY2024'
    );
    expect(gross.querySelector('svg')).not.toBeNull();
  });

  it('hides trends behind a gentle hint while only one year exists', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);

    const gross = await screen.findByRole('article', { name: 'Gross margin' });
    expect(gross.querySelector('svg')).toBeNull();
    expect(screen.getByText('Add more years to see trends.')).toBeVisible();
  });

  it('keeps the trends section away below three years', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}`);

    await screen.findByRole('article', { name: 'Gross margin' });
    expect(screen.queryByRole('region', { name: 'Trends' })).not.toBeInTheDocument();
  });

  it('offers grouped trends with a table fallback once three years exist', async () => {
    const company = await seedCompany();
    for (let offset = 0; offset < 3; offset += 1) {
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'income',
          { revenue: e(100_000), costOfRevenue: e(60_000 - offset * 1_000) },
          `FY${2022 + offset}` as FyLabel
        )
      );
    }

    renderAt(`/company/${company.id}`);

    const section = await screen.findByRole('region', { name: 'Trends' });
    const picker = within(section).getByRole('radiogroup', { name: 'Trend group' });
    expect(within(picker).getAllByRole('radio')).toHaveLength(5);
    // The year-range control exists only past five labelled years.
    expect(screen.queryByRole('radiogroup', { name: 'Year range' })).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: 'Show table' }));
    const grossRow = within(section).getByRole('row', { name: /Gross margin/ });
    expect(grossRow).toHaveTextContent('40.0%');
    expect(grossRow).toHaveTextContent('42.0%');

    fireEvent.click(within(picker).getByRole('radio', { name: 'Safety' }));
    expect(within(section).getByRole('row', { name: /Interest coverage/ })).toBeVisible();
    expect(within(section).getByRole('button', { name: 'Show charts' })).toBeVisible();
  });

  it('scopes the trends by the year-range control once six years exist', async () => {
    const company = await seedCompany();
    for (let offset = 0; offset < 6; offset += 1) {
      const year = 2019 + offset;
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'income',
          { revenue: e(100_000), costOfRevenue: e(60_000 - offset * 1_000) },
          `FY${year}` as FyLabel
        )
      );
    }

    renderAt(`/company/${company.id}`);

    const section = await screen.findByRole('region', { name: 'Trends' });
    fireEvent.click(within(section).getByRole('button', { name: 'Show table' }));
    expect(
      within(section).queryByRole('columnheader', { name: 'FY2019' })
    ).not.toBeInTheDocument();
    expect(within(section).getByRole('columnheader', { name: 'FY2024' })).toBeVisible();

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(await within(section).findByRole('columnheader', { name: 'FY2019' })).toBeVisible();
  });

  it('fires, dismisses and restores an item to investigate', async () => {
    const company = await seedCompany();
    await upsertStatement(
      db,
      yearWrite(company.id, 'income', {
        revenue: e(100_000),
        operatingIncome: e(2_000),
        interestExpense: e(1_000)
      })
    );

    renderAt(`/company/${company.id}`);

    const section = await screen.findByRole('region', { name: 'Items to investigate' });
    const banner = within(section).getByRole('article', { name: 'Fragility' });
    expect(within(banner).getAllByText(/interest/i).length).toBeGreaterThan(0);

    fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
    expect(await within(section).findByRole('button', { name: '1 dismissed' })).toBeVisible();
    expect(within(section).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    const stored = await db.flagDismissals.get([company.id, 'fragility']);
    expect(stored?.dismissedAtFy).toBe('FY2024');

    fireEvent.click(within(section).getByRole('button', { name: '1 dismissed' }));
    fireEvent.click(await within(section).findByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      expect(within(section).getByRole('button', { name: 'Dismiss' })).toBeVisible();
    });
  });

  it('lets a stale dismissal from an earlier year speak again', async () => {
    const company = await seedCompany();
    await upsertStatement(
      db,
      yearWrite(company.id, 'income', {
        revenue: e(100_000),
        operatingIncome: e(2_000),
        interestExpense: e(1_000)
      })
    );
    await db.flagDismissals.put({
      companyId: company.id,
      ruleId: 'fragility',
      dismissedAtFy: 'FY2023',
      dismissedAt: '2025-09-01T00:00:00Z'
    });

    renderAt(`/company/${company.id}`);

    const section = await screen.findByRole('region', { name: 'Items to investigate' });
    expect(within(section).getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });

  it('opens the metric sheet from a card, reproducible by hand, and closes clean', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await putPrice(db, { companyId: company.id, amountMinor: 30, currency: 'USD', asOf: '2026-07-10' });

    renderAt(`/company/${company.id}`);
    const card = await screen.findByRole('article', { name: 'Gross margin' });
    fireEvent.click(card);

    const sheet = await screen.findByRole('dialog', { name: 'Gross margin' });
    expect(within(sheet).getByText('40.0%')).toBeVisible();
    expect(within(sheet).getByText('gross profit ÷ revenue')).toBeVisible();
    // This year's actual inputs, substituted and listed with provenance.
    expect(within(sheet).getByText('$400 ÷ $1.00k = 40.0%')).toBeVisible();
    expect(within(sheet).getByText('Gross profit (derived)')).toBeVisible();
    expect(within(sheet).getAllByText('entered by hand').length).toBeGreaterThan(0);
    expect(within(sheet).getByText(/pricing power/)).toBeVisible();
    expect(within(sheet).getByRole('heading', { name: "Owner's lens" })).toBeVisible();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Apple Inc.' })).toBeVisible();
  });

  it('names the source filing on an imported input and links out to it', async () => {
    const company = await seedCompany();
    await upsertStatement(db, {
      ...yearWrite(company.id, 'income', {
        revenue: e(100_000),
        costOfRevenue: e(60_000),
        grossProfit: e(40_000)
      }),
      provenance: {
        source: 'edgar',
        recordedAt: '2026-07-18T06:05:30Z',
        filing: {
          system: 'EDGAR',
          documentId: '0000320193-25-000079',
          url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/'
        }
      }
    });

    renderAt(`/company/${company.id}?metric=grossMargin`);

    const sheet = await screen.findByRole('dialog', { name: 'Gross margin' });
    const chips = within(sheet).getAllByRole('link', {
      name: 'EDGAR filing 0000320193-25-000079'
    });
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip).toHaveAttribute(
        'href',
        'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/'
      );
      expect(chip).toHaveAttribute('target', '_blank');
    }
  });

  it('answers the address directly and offers the table fallback', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);

    renderAt(`/company/${company.id}?metric=roe`);

    const sheet = await screen.findByRole('dialog', { name: 'ROE' });
    expect(within(sheet).getByText('37.5%')).toBeVisible();
    expect(within(sheet).getByText('ending basis')).toBeVisible();
    // One computed year: no chart, and the trend block stays away entirely.
    expect(within(sheet).queryByRole('button', { name: /Show/ })).not.toBeInTheDocument();
  });

  it('shows chart and table views once history exists', async () => {
    const company = await seedCompany();
    for (let offset = 0; offset < 3; offset += 1) {
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'income',
          { revenue: e(100_000), costOfRevenue: e(60_000 - offset * 1_000) },
          `FY${2022 + offset}` as FyLabel
        )
      );
    }

    renderAt(`/company/${company.id}?metric=grossMargin`);

    const sheet = await screen.findByRole('dialog', { name: 'Gross margin' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Show table' }));
    expect(within(sheet).getByRole('row', { name: /FY2022/ })).toHaveTextContent('40.0%');
    expect(within(sheet).getByRole('row', { name: /FY2024/ })).toHaveTextContent('42.0%');
    expect(within(sheet).getByRole('button', { name: 'Show chart' })).toBeVisible();
  });

  it("hides the Owner's lens when the education layer is off", async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await setMeta(db, 'educationLayerOff', true);

    renderAt(`/company/${company.id}?metric=roe`);

    const sheet = await screen.findByRole('dialog', { name: 'ROE' });
    expect(within(sheet).getByText(/owners' capital worked/)).toBeVisible();
    expect(within(sheet).queryByRole('heading', { name: "Owner's lens" })).not.toBeInTheDocument();
  });

  it('carries the companion metric with its own formula disclosure', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await putPrice(db, { companyId: company.id, amountMinor: 30, currency: 'USD', asOf: '2026-07-10' });

    renderAt(`/company/${company.id}?metric=pe`);

    const sheet = await screen.findByRole('dialog', { name: 'P/E' });
    expect(within(sheet).getByText('Earnings yield')).toBeVisible();
    expect(within(sheet).getByText('5.0%')).toBeVisible();
    expect(within(sheet).getByText('Share price')).toBeVisible();
    expect(within(sheet).getByText(/\$0\.300 as of 2026-07-10/)).toBeVisible();
  });

  it('explains an n/m year in one sentence on its sheet', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id, -2_000);

    renderAt(`/company/${company.id}?metric=roe`);

    const sheet = await screen.findByRole('dialog', { name: 'ROE' });
    expect(within(sheet).getByText('n/m: negative equity')).toBeVisible();
    expect(within(sheet).getByText(/no positive equity base/)).toBeVisible();
  });

  it('renders the sample corpus end to end', async () => {
    const { loadSampleData } = await import('../library/loadSamples');
    await loadSampleData(db);

    // CSL alone since the ASX-first steer: ten hand-verified years, an ASX
    // listing reporting in USD, straight through the whole render path.
    renderAt('/company/sample-csl');
    expect(await screen.findByRole('heading', { name: 'CSL' })).toBeVisible();
    const gross = await screen.findByRole('article', { name: 'Gross margin' });
    expect(within(gross).getByText(/\d+\.\d%/)).toBeVisible();
  });

  it('shows the ending basis when total liabilities are never filed', async () => {
    // Some filers never print a total-liabilities line, so no year is
    // complete and the return metrics stay on the ending basis despite
    // multiple years of data (the trait Coca-Cola carried while it was a
    // sample; kept as a seeded case since the sample set went ASX-only).
    const company = await seedCompany();
    for (const fy of ['FY2023', 'FY2024'] as const) {
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'income',
          {
            revenue: e(100_000),
            costOfRevenue: e(60_000),
            operatingIncome: e(20_000),
            interestExpense: e(1_000),
            pretaxIncome: e(19_000),
            taxExpense: e(4_000),
            netIncome: e(15_000),
            dilutedShares: e(10_000)
          },
          fy
        )
      );
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'balance',
          {
            cashAndEquivalents: e(5_000),
            currentAssets: e(30_000),
            totalAssets: e(100_000),
            currentLiabilities: e(15_000),
            shortTermDebt: e(2_000),
            longTermDebt: e(18_000),
            totalEquity: e(40_000)
          },
          fy
        )
      );
      await upsertStatement(
        db,
        yearWrite(
          company.id,
          'cashflow',
          {
            operatingCashFlow: e(18_000),
            capex: e(6_000)
          },
          fy
        )
      );
    }

    renderAt(`/company/${company.id}?metric=roe`);
    const sheet = await screen.findByRole('dialog', { name: 'ROE' });
    expect(within(sheet).getByText('ending basis')).toBeVisible();
  });

  it('marks a stale price on the valuation cards', async () => {
    const company = await seedCompany();
    await seedFullYear(company.id);
    await putPrice(db, { companyId: company.id, amountMinor: 30, currency: 'USD', asOf: '2026-01-01' });

    renderAt(`/company/${company.id}`);

    const pe = await screen.findByRole('article', { name: 'P/E' });
    expect(within(pe).getByText('as of 2026-01-01')).toBeVisible();
  });
});
