// @vitest-environment jsdom

// The file-upload picker (frontend spec §3): validation in plain words, the
// provider select wearing the data-policy labels, the confidential toggle
// filtering to paid no-training endpoints, and kickoff handing over exactly
// what was chosen.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { keyedProviders } from '../settings/providers';
import { confidentialEligible, UploadFilingSheet, validateFiling } from './UploadFilingSheet';

const providers = keyedProviders();

// The sheet renders Router links, so it mounts inside a bare route shell.
function renderSheet(overrides: Partial<Parameters<typeof UploadFilingSheet>[0]> = {}) {
  const props = {
    open: true,
    onClose: () => undefined,
    providers,
    onStart: () => undefined,
    ...overrides
  };
  const rootRoute = createRootRoute({ component: () => <UploadFilingSheet {...props} /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  render(<RouterProvider router={router} />);
}

describe('validateFiling', () => {
  it('wants a PDF', () => {
    expect(validateFiling({ name: 'report.docx', type: 'application/msword', size: 10 })).toBe(
      'Choose a PDF: the annual report as the company filed it.'
    );
    expect(validateFiling({ name: 'AR2024.pdf', type: 'application/pdf', size: 10 })).toBeNull();
  });

  it('declines a scan bundle by size', () => {
    expect(
      validateFiling({ name: 'AR2024.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 })
    ).toMatch(/over 25 MB/);
  });
});

describe('confidentialEligible', () => {
  it('keeps paid no-training providers and drops the rest', () => {
    const byId = new Map(providers.map((provider) => [provider.id, provider]));
    expect(confidentialEligible(byId.get('anthropic')!)).toBe(true);
    expect(confidentialEligible(byId.get('gemini')!)).toBe(true);
    expect(confidentialEligible(byId.get('deepseek')!)).toBe(false);
    expect(confidentialEligible(byId.get('groq')!)).toBe(false);
  });
});

describe('the upload sheet', () => {
  it('points at the providers screen when no key is stored', async () => {
    renderSheet({ providers: [] });
    expect(await screen.findByText(/none is stored on this device yet/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Settings, then Providers' })).toBeVisible();
  });

  it('lists providers with their policy words and filters them for a confidential document', async () => {
    renderSheet();
    const list = await screen.findByRole('radiogroup', { name: 'Provider' });
    expect(within(list).getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByText('May train on inputs; public documents only.')).toBeVisible();

    fireEvent.click(screen.getByRole('switch', { name: 'This document is confidential' }));
    expect(within(list).getAllByRole('radio')).toHaveLength(2);
    expect(within(list).queryByRole('radio', { name: /DeepSeek/ })).not.toBeInTheDocument();
  });

  it('speaks the validation line for the wrong kind of file', async () => {
    renderSheet();
    const input = await screen.findByLabelText('Annual report PDF');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] }
    });
    expect(
      screen.getByText('Choose a PDF: the annual report as the company filed it.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
  });

  it('kicks off with exactly the chosen file, provider, and sensitivity', async () => {
    const onStart = vi.fn();
    renderSheet({ onStart });
    const file = new File(['%PDF-1.4'], 'AR2024.pdf', { type: 'application/pdf' });

    fireEvent.change(await screen.findByLabelText('Annual report PDF'), {
      target: { files: [file] }
    });
    fireEvent.click(screen.getByRole('radio', { name: /Anthropic/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'This document is confidential' }));
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    expect(onStart).toHaveBeenCalledWith({
      file,
      providerId: 'anthropic',
      confidential: true
    });
  });
});
