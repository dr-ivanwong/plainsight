import { expect, test, type Page } from '@playwright/test';

/**
 * Journey B (main plan §3) against a stubbed edge: search a ticker, watch the
 * first-request ingesting state resolve, and land on a dashboard whose
 * numbers computed from the imported statements, provenance intact in the
 * detail sheet. The stubs answer exactly the wire contract, 202 first, so
 * the client's retry loop is exercised for real; the deployed end-to-end
 * pass (real EDGAR, real edge) is the Phase 2 exit criterion's job.
 */

// The route stubs must see every request, but once the service worker takes
// control it mediates fetches that interception cannot reach in WebKit.
// Journey A owns the offline proof; this journey blocks the worker.
test.use({ serviceWorkers: 'block' });

const SEARCH_BODY = {
  results: [{ ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, exchange: 'Nasdaq' }]
};

const PROVENANCE = {
  source: 'edgar',
  recordedAt: '2026-07-12T00:00:00Z',
  filing: {
    system: 'EDGAR',
    documentId: '0000320193-24-000123',
    url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/'
  },
  mappingVersion: 'edgar-us-gaap-1'
};

const FINANCIALS_BODY = {
  ticker: 'AAPL',
  statements: [
    {
      fy: 'FY2024',
      statement: 'income',
      endDate: '2024-09-28',
      currency: 'USD',
      values: {
        revenue: 39_103_500_000_000,
        costOfRevenue: 21_035_200_000_000,
        netIncome: 9_373_600_000_000
      },
      provenance: PROVENANCE
    }
  ],
  gaps: []
};

const INGESTING_BODY = {
  error: {
    code: 'ingesting',
    message: 'First request for this ticker; its filings are being ingested. Retry shortly.',
    details: [{ reason: 'ingesting', retryAfterSeconds: 1 }],
    requestId: 'req_e2e'
  }
};

async function stubApi(page: Page): Promise<void> {
  await page.route('**/v1/search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_BODY) })
  );
  let financialsCalls = 0;
  await page.route('**/v1/companies/AAPL/financials**', (route) => {
    financialsCalls += 1;
    if (financialsCalls === 1) {
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify(INGESTING_BODY)
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FINANCIALS_BODY)
    });
  });
}

test('ticker to pre-filled model, through the ingesting wait', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search by ticker or company name' }).fill('apple');
  await page.getByRole('button', { name: /AAPL/ }).click();

  // The honest first-request state, then the landing.
  await expect(page.getByText('Fetching AAPL filings from EDGAR…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apple Inc.' })).toBeVisible();

  // The imported year computed: (39,103,500 - 21,035,200) / 39,103,500 = 46.2%.
  const gross = page.getByRole('article', { name: 'Gross margin', exact: true });
  await expect(gross).toContainText('46.2%');

  // Provenance survived the trip: the detail sheet names the filing source.
  await gross.click();
  const sheet = page.getByRole('dialog', { name: 'Gross margin' });
  await expect(sheet).toContainText('EDGAR filing');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Re-importing resolves to the same company rather than a twin. At the
  // e2e viewport the navigation rail is the way home.
  const railLibrary = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' });
  await railLibrary.click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search by ticker or company name' }).fill('apple');
  await page.getByRole('button', { name: /AAPL/ }).click();
  await expect(page.getByRole('heading', { name: 'Apple Inc.' })).toBeVisible();
  await railLibrary.click();
  // One Apple row, not a twin; named precisely because the rail adds lists
  // of its own to every screen.
  await expect(page.getByRole('link', { name: /Apple Inc\./ })).toHaveCount(1);
});
