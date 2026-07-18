import { expect, test, type Page } from '@playwright/test';

/**
 * The Phase 1 exit criterion (main plan §8): Journey A, completable in
 * airplane mode. One online visit installs the service worker; everything
 * after happens offline, from the first-launch welcome through company
 * creation, statement entry, the computed dashboard, and the detail sheet
 * with its by-hand formula.
 *
 * WebKit's network emulation blocks navigations before the service worker
 * can answer them (a driver limitation, not an app one), so the airplane
 * proof runs on Chromium and WebKit walks the identical journey online.
 */
async function walkJourneyA(page: Page): Promise<void> {
  // A true first launch.
  await expect(
    page.getByRole('heading', { name: 'Read financial statements like an owner' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  // Create the company.
  await page.getByRole('button', { name: 'Add a company' }).click();
  await page.getByLabel('Name').fill('Wesfarmers');
  // Exact: the library also mounts the import dialog, whose accessible name
  // contains the word Ticker.
  await page.getByLabel('Ticker', { exact: true }).fill('WES');
  await page.getByRole('button', { name: 'Add company' }).click();
  await expect(page.getByRole('heading', { name: 'Wesfarmers' })).toBeVisible();

  // Enter the first fiscal year.
  await page.getByRole('link', { name: 'Add the first year' }).click();
  await page.getByLabel('Year-end date').fill('2025-06-30');
  await page.getByRole('button', { name: 'Add year' }).click();

  const revenue = page.getByRole('textbox', { name: 'Revenue, FY2025', exact: true });
  await expect(revenue).toBeFocused();
  await revenue.fill('44,189');
  await revenue.press('Enter');
  const cost = page.getByRole('textbox', { name: 'Cost of revenue, FY2025', exact: true });
  await expect(cost).toBeFocused();
  await cost.fill('30,356');
  await cost.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Saved · just now');
  // The ticker already read Saved after the first commit, so it cannot order
  // the second one; the core-items count can, because it derives from the
  // stored row. Navigating before this line raced the cost commit.
  await expect(page.getByText('2 of 8 core items')).toBeVisible();

  // The dashboard computes: (44,189 - 30,356) / 44,189 = 31.3%. At the e2e
  // viewport (1280, past the rail breakpoint) the section rail owns the way
  // there; the entry back affordance is chrome the rail retired.
  await page
    .getByRole('navigation', { name: 'Company sections' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  const gross = page.getByRole('article', { name: 'Gross margin', exact: true });
  await expect(gross).toContainText('31.3%');

  // Tap into the explanation: the sheet, its formula, the substituted figures.
  await gross.click();
  const sheet = page.getByRole('dialog', { name: 'Gross margin' });
  await expect(sheet).toContainText('gross profit ÷ revenue');
  await expect(sheet).toContainText('= 31.3%');
  await expect(sheet).toContainText('entered by hand');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Relaunch-safe: a cold navigation lands back on live data.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Wesfarmers' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Gross margin', exact: true })).toContainText(
    '31.3%'
  );
}

test('Journey A completes in airplane mode', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'offline emulation reaches the service worker on Chromium only');

  // First visit online: the shell precaches.
  await page.goto('/');
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null && navigator.serviceWorker.controller !== null;
  });

  // Airplane mode from here on; the reload is served by the service worker.
  await context.setOffline(true);
  await page.reload();
  await walkJourneyA(page);
});

test('Journey A completes on WebKit', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium', 'Chromium proves the airplane-mode variant above');

  await page.goto('/');
  await walkJourneyA(page);
});
