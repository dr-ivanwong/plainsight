// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoneyField } from './MoneyField';

const renderField = (over: Partial<Parameters<typeof MoneyField>[0]> = {}) => {
  const onCommit = vi.fn();
  render(
    <MoneyField
      value={null}
      scale="millions"
      unit="money"
      signed={false}
      label="Revenue, FY2024"
      onCommit={onCommit}
      {...over}
    />
  );
  return onCommit;
};

const input = () => screen.getByRole('textbox', { name: 'Revenue, FY2024' });

describe('MoneyField', () => {
  it('shows a committed value formatted in the entry scale', () => {
    renderField({ value: 39_103_500_000_000 });
    expect(input()).toHaveValue('391,035');
  });

  it('inserts separators as you type', () => {
    // Caret preservation is pinned in the moneyEntry unit tests; synthetic
    // change events cannot reproduce browser caret behaviour.
    renderField();
    const field = input() as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: '1234567' } });
    expect(field.value).toBe('1,234,567');
    fireEvent.change(field, { target: { value: '1,234,5678' } });
    expect(field.value).toBe('12,345,678');
  });

  it('refuses keystrokes the value model cannot hold', () => {
    renderField();
    const field = input();
    fireEvent.change(field, { target: { value: 'abc' } });
    expect(field).toHaveValue('');
    fireEvent.change(field, { target: { value: '-5' } });
    expect(field).toHaveValue('');
    fireEvent.change(field, { target: { value: '1.234' } });
    expect(field).toHaveValue('');
  });

  it('allows negatives only when signed', () => {
    const onCommit = renderField({ signed: true });
    const field = input();
    fireEvent.change(field, { target: { value: '-500' } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith(-50_000_000_000);
  });

  it('commits on blur in stored minor units and skips a no-change commit', () => {
    const onCommit = renderField({ value: 39_103_500_000_000 });
    const field = input();
    fireEvent.change(field, { target: { value: '391,036' } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith(39_103_600_000_000);

    fireEvent.change(field, { target: { value: '391,036' } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits once when Enter is chased by the focus-move blur', () => {
    const onCommit = renderField();
    const field = input();
    fireEvent.change(field, { target: { value: '42' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(4_200_000_000);
  });

  it('commits on Enter and reverts on Escape', () => {
    const onCommit = renderField();
    const field = input();
    fireEvent.change(field, { target: { value: '42' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(4_200_000_000);

    fireEvent.change(field, { target: { value: '99' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits empty as the unknown state', () => {
    const onCommit = renderField({ value: 100_000_000 });
    const field = input();
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('offers the not-reported assertion from the overflow menu', () => {
    const onCommit = renderField();
    fireEvent.click(screen.getByRole('button', { name: 'Revenue, FY2024, options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Not reported → 0' }));
    expect(onCommit).toHaveBeenCalledWith('zero');
  });

  it('renders the asserted state as a chip that can be cleared', () => {
    const onCommit = renderField({ value: 'zero' });
    const chip = screen.getByRole('button', {
      name: 'Revenue, FY2024, not reported, counted as zero'
    });
    expect(chip).toHaveTextContent('∅0');

    fireEvent.click(chip);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear not reported' }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('shows a derived figure grey as the placeholder', () => {
    renderField({ derivedMinor: 16_923_400_000_000 });
    expect(input()).toHaveAttribute('placeholder', '169,234');
    expect(input()).toHaveValue('');
  });
});
