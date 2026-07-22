import {
  formatMetricValue,
  type CurrencyCode,
  type MetricFormat,
  type MetricId
} from '@plainsight/calc-engine';
import { useState, type FormEvent, type ReactElement } from 'react';

import { BENCHMARK_DEFAULTS, db, putBenchmark, removeBenchmark } from '../../db';
import * as styles from './benchmarkEditor.css';

/**
 * The benchmark's field speaks display units: percent points for percentage
 * metrics, plain decimals otherwise. The entry grid's parser speaks integer
 * magnitudes at statement scales, so this small field carries the same
 * tolerances (spaces and thousands separators) and the same refusals
 * (anything else, inline, saving nothing) in a parser of its own.
 */
export function parseBenchmarkText(text: string, kind: MetricFormat): number | null {
  const cleaned = text.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const entered = Number(cleaned);
  if (!Number.isFinite(entered) || entered <= 0) return null;
  return kind === 'percent' ? entered / 100 : entered;
}

const UNIT_HINT: Record<MetricFormat, string> = {
  percent: '%',
  ratio: '',
  coverage: '×',
  money: ''
};

/**
 * The reference line's editor (dashboard design plan §6.5): a quiet button
 * stating the current benchmark, opening in place to a numeric field with
 * save, reset to the pre-populated default where one exists, and remove.
 * Changes save immediately; invalid input refuses inline and saves nothing.
 * The Owner's-lens paragraph explains the line where it lives and hides with
 * the education layer; the line itself stays either way.
 */
export function BenchmarkEditor({
  metricId,
  kind,
  currency,
  value,
  educationOff
}: {
  metricId: MetricId;
  kind: MetricFormat;
  currency: CurrencyCode;
  /** The stored benchmark in the metric's native unit; absent when unset. */
  value?: number;
  educationOff: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const defaultValue = BENCHMARK_DEFAULTS[metricId];

  const displayText = (native: number): string =>
    kind === 'percent' ? String(Math.round(native * 1000) / 10) : String(native);

  const openEditor = (): void => {
    setText(value === undefined ? '' : displayText(value));
    setError(null);
    setOpen(true);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseBenchmarkText(text, kind);
    if (parsed === null) {
      setError('Enter the benchmark as a positive number.');
      return;
    }
    await putBenchmark(db, metricId, parsed);
    setError(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.summary}
        aria-expanded={false}
        onClick={openEditor}
      >
        {value === undefined
          ? 'Set benchmark'
          : `Benchmark ${formatMetricValue({ status: 'ok', value }, kind, currency)}`}
      </button>
    );
  }

  const unit = UNIT_HINT[kind];
  return (
    <form className={styles.panel} onSubmit={(event) => void handleSubmit(event)}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {unit === '' ? 'Benchmark' : `Benchmark (${unit})`}
        </span>
        <input
          className={styles.input}
          value={text}
          inputMode="decimal"
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <button type="submit" className={styles.action}>
          Save
        </button>
        {defaultValue === undefined ? null : (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              void putBenchmark(db, metricId, defaultValue).then(() => {
                setError(null);
                setOpen(false);
              });
            }}
          >
            Reset to default
          </button>
        )}
        {value === undefined ? null : (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              void removeBenchmark(db, metricId).then(() => {
                setError(null);
                setOpen(false);
              });
            }}
          >
            Remove
          </button>
        )}
        <button type="button" className={styles.action} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {error === null ? null : (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {educationOff ? null : (
        <p className={styles.lens}>
          A reference line is a lens for your own judgement, never a verdict: it marks the
          level you consider worth noticing, and it fires nothing. The items to investigate
          stay the only alerts, and the app never says buy or sell.
        </p>
      )}
    </form>
  );
}
