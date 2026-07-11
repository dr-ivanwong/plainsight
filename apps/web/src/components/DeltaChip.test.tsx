// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DeltaChip } from './DeltaChip';

describe('DeltaChip', () => {
  it('speaks percentage changes in points, with the window for screen readers', () => {
    render(
      <DeltaChip
        delta={{ fromFy: 'FY2019', toFy: 'FY2024', change: 0.052, direction: 'up' }}
        kind="percent"
        currency="USD"
      />
    );
    const chip = screen.getByText(/5\.2 pp/);
    expect(chip).toHaveAttribute('aria-label', 'up 5.2 percentage points, FY2019 to FY2024');
  });

  it('formats money deltas compact and downward', () => {
    render(
      <DeltaChip
        delta={{ fromFy: 'FY2019', toFy: 'FY2024', change: -125_000, direction: 'down' }}
        kind="money"
        currency="USD"
      />
    );
    expect(screen.getByText(/\$1\.25k/)).toBeVisible();
    expect(screen.getByText(/\$1\.25k/)).toHaveAttribute(
      'aria-label',
      'down $1.25k, FY2019 to FY2024'
    );
  });

  it('reads a flat change as unchanged', () => {
    render(
      <DeltaChip
        delta={{ fromFy: 'FY2019', toFy: 'FY2024', change: 0, direction: 'flat' }}
        kind="ratio"
        currency="USD"
      />
    );
    expect(screen.getByText(/0\.00/)).toHaveAttribute(
      'aria-label',
      'unchanged 0.00, FY2019 to FY2024'
    );
  });
});
