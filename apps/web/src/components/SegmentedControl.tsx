import { useId, type ReactElement } from 'react';

import * as styles from './segmentedControl.css';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

/**
 * A pick-one-of-few control styled as segments. Native radios underneath:
 * arrow keys move within the group and the checked state carries the
 * semantics, so nothing here reinvents keyboard or screen-reader behaviour.
 * `wrap` lets a many-option group (the compare trend's measures) flow onto
 * new lines instead of forcing a scroll.
 */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  wrap = false
}: {
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (next: V) => void;
  wrap?: boolean;
}): ReactElement {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={wrap ? styles.groupWrap : styles.group}>
      {options.map((option) => (
        <label
          key={option.value}
          className={option.value === value ? styles.segmentActive : styles.segment}
        >
          <input
            type="radio"
            className={styles.radio}
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
