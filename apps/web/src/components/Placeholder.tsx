import type { ReactElement, ReactNode } from 'react';

import * as styles from './placeholder.css';

/**
 * Scaffolding for routes whose screens land in later slices. Each real screen
 * replaces its placeholder; this component dies with the last one.
 */
export function Placeholder({
  title,
  note,
  children
}: {
  title: string;
  note: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>{note}</p>
      {children}
    </section>
  );
}
