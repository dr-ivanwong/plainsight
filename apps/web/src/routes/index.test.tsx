// @vitest-environment jsdom

// The Library's true-empty state (frontend spec §3): the one-line promise and
// both starting actions, queried by role the way a user would find them.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LibraryEmpty } from '../features/library/LibraryEmpty';

describe('the Library, true-empty state', () => {
  it('shows the one-line promise', () => {
    render(<LibraryEmpty />);

    expect(
      screen.getByRole('heading', {
        name: 'Read financial statements like an owner',
      }),
    ).toBeVisible();
  });

  it('offers both starting actions as real buttons', () => {
    render(<LibraryEmpty />);

    expect(screen.getByRole('button', { name: 'Add a company' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'See it with sample data' }),
    ).toBeVisible();
  });
});
