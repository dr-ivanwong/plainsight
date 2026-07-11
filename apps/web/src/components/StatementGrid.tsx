import type {
  CurrencyCode,
  EntryValue,
  FyLabel,
  LineItemId,
  LineItemMeta,
  Scale
} from '@plainsight/calc-engine';
import type { KeyboardEvent, ReactElement } from 'react';

import { MoneyField, type FieldValue } from './MoneyField';
import { unitOf } from './moneyEntry';
import * as styles from './statementGrid.css';

/** One fiscal year column: header facts plus the stored values for this statement. */
export interface GridYear {
  fy: FyLabel;
  entryScale: Scale;
  currency: CurrencyCode;
  values: Partial<Readonly<Record<LineItemId, EntryValue>>>;
}

const SCALE_WORD: Readonly<Record<Scale, string>> = {
  ones: 'units',
  thousands: 'thousands',
  millions: 'millions',
  billions: 'billions'
};

const fieldValue = (entry: EntryValue | undefined): FieldValue => {
  if (entry === undefined) return null;
  return entry.kind === 'not_reported_zero' ? 'zero' : entry.amountMinor;
};

/**
 * Gross profit is the one derived row: while unentered it shows revenue less
 * cost of revenue, live and grey, and an entered figure overrides it
 * (as-reported precedence, data-model spec §4).
 */
function derivedMinorFor(item: LineItemMeta, year: GridYear): number | undefined {
  if (item.id !== 'grossProfit' || year.values.grossProfit !== undefined) return undefined;
  const resolve = (entry: EntryValue | undefined): number | undefined => {
    if (entry === undefined) return undefined;
    return entry.kind === 'not_reported_zero' ? 0 : entry.amountMinor;
  };
  const revenue = resolve(year.values.revenue);
  const cost = resolve(year.values.costOfRevenue);
  if (revenue === undefined || cost === undefined) return undefined;
  return revenue - cost;
}

function focusCell(table: HTMLTableElement, row: number, col: number): boolean {
  const cell = table.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  if (cell === null) return false;
  cell.focus();
  if (cell instanceof HTMLInputElement) cell.select();
  return true;
}

/**
 * The entry and review table shell (frontend spec §5): canonical line items
 * as rows with their find-it-as hints, fiscal years as columns, a sticky
 * label column under horizontal scroll, and spreadsheet keys: up and down
 * move rows, Enter commits and moves down, left and right move columns once
 * the cursor reaches the text's edge.
 */
export function StatementGrid({
  rows,
  years,
  mode = 'entry',
  onCommit
}: {
  rows: readonly LineItemMeta[];
  years: readonly GridYear[];
  mode?: 'entry' | 'review';
  onCommit: (fy: FyLabel, id: LineItemId, value: FieldValue) => void;
}): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>): void {
    const target = event.target as HTMLElement;
    const rowAttr = target.getAttribute('data-row');
    const colAttr = target.getAttribute('data-col');
    if (rowAttr === null || colAttr === null) return;
    const row = Number(rowAttr);
    const col = Number(colAttr);
    const input = target instanceof HTMLInputElement ? target : null;
    const caretAtStart =
      input === null || (input.selectionStart === 0 && input.selectionEnd === 0);
    const caretAtEnd =
      input === null ||
      (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);

    let next: readonly [number, number] | null = null;
    if (event.key === 'ArrowDown' || event.key === 'Enter') next = [row + 1, col];
    else if (event.key === 'ArrowUp') next = [row - 1, col];
    else if (event.key === 'ArrowLeft' && caretAtStart) next = [row, col - 1];
    else if (event.key === 'ArrowRight' && caretAtEnd) next = [row, col + 1];
    if (next === null) return;
    if (focusCell(event.currentTarget, next[0], next[1])) event.preventDefault();
  }

  return (
    <div className={styles.scroller}>
      <table className={styles.table} data-mode={mode} onKeyDown={handleKeyDown}>
        <thead>
          <tr>
            <th scope="col" className={styles.labelHead}>
              Line item
            </th>
            {years.map((year) => (
              <th scope="col" key={year.fy} className={styles.yearHead}>
                <span className={styles.fy}>{year.fy}</span>
                <span className={styles.scaleNote}>
                  figures in {SCALE_WORD[year.entryScale]}, {year.currency}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, rowIndex) => (
            <tr key={item.id}>
              <th scope="row" className={styles.labelCell}>
                <span className={styles.itemLabel}>{item.label}</span>
                <span className={styles.hint} title={item.findItAs}>
                  {item.findItAs}
                </span>
              </th>
              {years.map((year, colIndex) => (
                <td key={year.fy} className={styles.cell}>
                  <MoneyField
                    value={fieldValue(year.values[item.id])}
                    scale={year.entryScale}
                    unit={unitOf(item.id)}
                    signed={item.signed}
                    label={`${item.label}, ${year.fy}`}
                    derivedMinor={derivedMinorFor(item, year)}
                    dataRow={rowIndex}
                    dataCol={colIndex}
                    onCommit={(value) => onCommit(year.fy, item.id, value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
