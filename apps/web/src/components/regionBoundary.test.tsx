// @vitest-environment jsdom

// The per-feature-region boundary (frontend spec section 2): a crash stays
// inside its region with the pinned three affordances (friendly message,
// retry, the export escape hatch), and the route-level backstop carries the
// same contract at screen width.
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';

import { RegionBoundary, RouteErrorFallback } from './RegionBoundary';
import { SheetShell } from './SheetShell';

let consoleError: MockInstance;

beforeEach(() => {
  // React re-reports boundary-caught errors through console.error; the spy
  // keeps the run quiet and lets the region-naming assertion read it.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

function Bomb({ until }: { until: { defused: boolean } }): ReactElement {
  if (!until.defused) throw new Error('boom');
  return <p>The region is healthy.</p>;
}

it('is invisible while the region is healthy', () => {
  render(
    <RegionBoundary region="The chart">
      <p>The region is healthy.</p>
    </RegionBoundary>
  );
  expect(screen.getByText('The region is healthy.')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('catches a crash with the pinned affordances, naming the region', () => {
  render(
    <RegionBoundary region="The chart" exportRun={async () => undefined}>
      <Bomb until={{ defused: false }} />
    </RegionBoundary>
  );
  const fallback = screen.getByRole('alert');
  expect(fallback.textContent).toContain('The chart hit a problem. Nothing you entered was touched.');
  expect(within(fallback).getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(within(fallback).getByRole('button', { name: 'Export my data' })).toBeVisible();
  expect(consoleError).toHaveBeenCalledWith(
    expect.stringContaining('The chart crashed'),
    expect.any(Error),
    expect.any(String)
  );
});

it('retries into a clean remount once the cause is gone', () => {
  const until = { defused: false };
  render(
    <RegionBoundary region="The chart">
      <Bomb until={until} />
    </RegionBoundary>
  );
  expect(screen.getByRole('alert')).toBeVisible();

  until.defused = true;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('The region is healthy.')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('a still-broken region lands back in the fallback on retry', () => {
  render(
    <RegionBoundary region="The chart">
      <Bomb until={{ defused: false }} />
    </RegionBoundary>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByRole('alert')).toBeVisible();
});

it('the escape hatch reports a successful export', async () => {
  const run = vi.fn(async () => undefined);
  render(
    <RegionBoundary region="The chart" exportRun={run}>
      <Bomb until={{ defused: false }} />
    </RegionBoundary>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Export my data' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Exported.');
  expect(run).toHaveBeenCalledTimes(1);
});

it('a failed export points at the data screen instead of pretending', async () => {
  render(
    <RegionBoundary
      region="The chart"
      exportRun={() => Promise.reject(new Error('storage said no'))}
    >
      <Bomb until={{ defused: false }} />
    </RegionBoundary>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Export my data' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Data & storage');
});

it('a sheet body crash stays inside the dialog', () => {
  render(
    <SheetShell open onClose={() => undefined} label="ROE">
      <Bomb until={{ defused: false }} />
    </SheetShell>
  );
  const dialog = screen.getByRole('dialog', { name: 'ROE' });
  expect(within(dialog).getByRole('alert').textContent).toContain('This sheet hit a problem.');
});

it('the route backstop offers retry, export, and a way home', () => {
  const reset = vi.fn();
  render(<RouteErrorFallback error={new Error('boom')} reset={reset} />);

  const fallback = screen.getByRole('alert');
  expect(fallback.textContent).toContain('This screen hit a problem');
  fireEvent.click(within(fallback).getByRole('button', { name: 'Try again' }));
  expect(reset).toHaveBeenCalledTimes(1);
  // A plain anchor on purpose: a full document load is the most
  // dependency-free way home a broken tree can offer.
  expect(within(fallback).getByRole('link', { name: 'Back to the library' })).toHaveAttribute(
    'href',
    '/'
  );
  expect(consoleError).toHaveBeenCalledWith('This screen crashed:', expect.any(Error));
});
