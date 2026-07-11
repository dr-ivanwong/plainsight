// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusValue } from './StatusValue';

describe('StatusValue', () => {
  it('formats ok values per the pinned display precision', () => {
    render(<StatusValue value={{ status: 'ok', value: 0.433 }} kind="percent" currency="USD" />);
    expect(screen.getByText('43.3%')).toBeVisible();
  });

  it('formats money compact with the currency symbol', () => {
    render(<StatusValue value={{ status: 'ok', value: 12_000 }} kind="money" currency="USD" />);
    expect(screen.getByText('$120')).toBeVisible();
  });

  it('speaks the pinned phrase for degenerate values, expanded for screen readers', () => {
    render(
      <StatusValue
        value={{ status: 'not_meaningful', reason: 'negative_equity' }}
        kind="percent"
        currency="USD"
      />
    );
    const phrase = screen.getByText('n/m: negative equity');
    expect(phrase).toBeVisible();
    expect(phrase).toHaveAttribute('aria-label', 'not meaningful: negative equity');
  });

  it('reads missing inputs as the work left to do, singular and plural', () => {
    const { rerender } = render(
      <StatusValue
        value={{ status: 'insufficient_data', missing: ['totalEquity'] }}
        kind="percent"
        currency="USD"
      />
    );
    expect(screen.getByText('Add the 1 missing number')).toBeVisible();

    rerender(
      <StatusValue
        value={{ status: 'insufficient_data', missing: ['revenue', 'netIncome'] }}
        kind="percent"
        currency="USD"
      />
    );
    expect(screen.getByText('Add the 2 missing numbers')).toBeVisible();
  });
});
