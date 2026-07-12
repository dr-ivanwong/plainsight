import type { ReactElement } from 'react';

import * as styles from './toggleSwitch.css';

/**
 * A small on-off switch over a native checkbox: the input carries the
 * behaviour and the switch role, the track and knob carry the look.
 */
export function ToggleSwitch({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <label className={styles.wrap}>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </label>
  );
}
