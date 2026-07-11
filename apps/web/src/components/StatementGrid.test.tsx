// @vitest-environment jsdom

import { coreItemsFor, LINE_ITEMS } from '@plainsight/calc-engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StatementGrid, type GridYear } from './StatementGrid';

const incomeRows = ['revenue', 'costOfRevenue', 'grossProfit', 'netIncome'].map(
  (id) => LINE_ITEMS[id as keyof typeof LINE_ITEMS]
);

const year = (over: Partial<GridYear> = {}): GridYear => ({
  fy: 'FY2024',
  entryScale: 'millions',
  currency: 'USD',
  values: {},
  ...over
});

describe('StatementGrid', () => {
  it('renders line items with their find-it-as hints and year headers with the scale', () => {
    render(<StatementGrid rows={incomeRows} years={[year()]} onCommit={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: /FY2024/ })).toHaveTextContent(
      'figures in millions, USD'
    );
    expect(screen.getByRole('rowheader', { name: /Revenue/ })).toHaveTextContent(
      /first line of the income statement/
    );
  });

  it('renders stored values, assertions, and blanks per cell', () => {
    const populated = year({
      values: {
        revenue: { kind: 'entered', amountMinor: 39_103_500_000_000 },
        costOfRevenue: { kind: 'not_reported_zero' }
      }
    });
    render(<StatementGrid rows={incomeRows} years={[populated]} onCommit={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Revenue, FY2024' })).toHaveValue('391,035');
    expect(
      screen.getByRole('button', { name: 'Cost of revenue, FY2024, not reported, counted as zero' })
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Net income, FY2024' })).toHaveValue('');
  });

  it('computes the derived gross profit live as a grey placeholder, and lets entry override it', () => {
    const populated = year({
      values: {
        revenue: { kind: 'entered', amountMinor: 39_103_500_000_000 },
        costOfRevenue: { kind: 'entered', amountMinor: 22_180_100_000_000 }
      }
    });
    render(<StatementGrid rows={incomeRows} years={[populated]} onCommit={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Gross profit, FY2024' })).toHaveAttribute(
      'placeholder',
      '169,234'
    );

    const entered = year({
      values: { grossProfit: { kind: 'entered', amountMinor: 1 } }
    });
    render(<StatementGrid rows={incomeRows} years={[entered]} onCommit={vi.fn()} />);
    const overridden = screen.getAllByRole('textbox', { name: 'Gross profit, FY2024' })[1];
    expect(overridden).not.toHaveAttribute('placeholder');
  });

  it('reports commits with the year and item addressed', () => {
    const onCommit = vi.fn();
    render(
      <StatementGrid
        rows={incomeRows}
        years={[year(), year({ fy: 'FY2023' })]}
        onCommit={onCommit}
      />
    );
    const field = screen.getByRole('textbox', { name: 'Net income, FY2023' });
    fireEvent.change(field, { target: { value: '93,736' } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith('FY2023', 'netIncome', 9_373_600_000_000);
  });

  it('moves down with Enter and arrows, and across at the text edges', () => {
    render(
      <StatementGrid
        rows={incomeRows}
        years={[year(), year({ fy: 'FY2023' })]}
        onCommit={vi.fn()}
      />
    );
    const revenue2024 = screen.getByRole('textbox', { name: 'Revenue, FY2024' });
    const cost2024 = screen.getByRole('textbox', { name: 'Cost of revenue, FY2024' });
    const revenue2023 = screen.getByRole('textbox', { name: 'Revenue, FY2023' });

    revenue2024.focus();
    fireEvent.keyDown(revenue2024, { key: 'Enter' });
    expect(cost2024).toHaveFocus();

    fireEvent.keyDown(cost2024, { key: 'ArrowUp' });
    expect(revenue2024).toHaveFocus();

    // Empty field: the caret sits at both edges, so horizontal keys move cells.
    fireEvent.keyDown(revenue2024, { key: 'ArrowRight' });
    expect(revenue2023).toHaveFocus();
    fireEvent.keyDown(revenue2023, { key: 'ArrowLeft' });
    expect(revenue2024).toHaveFocus();
  });

  it('covers every core income item when given the full statement', () => {
    const rows = coreItemsFor('income').map((id) => LINE_ITEMS[id]);
    render(<StatementGrid rows={rows} years={[year()]} onCommit={vi.fn()} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(rows.length);
  });
});
