import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactElement } from 'react';

import { SheetShell } from '../../components/SheetShell';
import { createCompany, db, SECTOR_IDS, SECTOR_LABELS } from '../../db';
import * as buttons from '../../styles/buttons.css';
import * as styles from './addCompany.css';

const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'NZD'] as const;

/**
 * The add-company sheet, open while `?add=1` is in the URL (frontend spec
 * §1.1 URL rules). Name and reporting currency are all a company needs to
 * exist; everything else is optional colour. Saving lands on the company's
 * dashboard, where the first fiscal year gets entered.
 */
export function AddCompanySheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string): string | undefined => {
      const value = form.get(name);
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
    };
    try {
      const created = await createCompany(db, {
        name: field('name') ?? '',
        ticker: field('ticker')?.toUpperCase(),
        exchange: field('exchange'),
        sector: field('sector'),
        currency: field('currency') ?? ''
      });
      await navigate({ to: '/company/$id', params: { id: created.id }, replace: true });
    } catch {
      setError('Could not save the company. Check the fields and try again.');
    }
  }

  return (
    <SheetShell open={open} onClose={onClose} label="Add a company">
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <h2 className={styles.heading}>Add a company</h2>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input className={styles.input} name="name" required autoComplete="off" />
        </label>

        <div className={styles.pair}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Ticker</span>
            <input className={styles.input} name="ticker" autoComplete="off" placeholder="Optional" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Exchange</span>
            <input className={styles.input} name="exchange" autoComplete="off" placeholder="Optional" />
          </label>
        </div>

        <div className={styles.pair}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sector</span>
            {/* A picker over the pinned vocabulary (data-model spec §12); free text retired with the grouped library. */}
            <select className={styles.input} name="sector" defaultValue="">
              <option value="">None</option>
              {SECTOR_IDS.map((id) => (
                <option key={id} value={id}>
                  {SECTOR_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Reporting currency</span>
            <select className={styles.input} name="currency" defaultValue="AUD">
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={buttons.secondaryAction} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttons.primaryAction}>
            Add company
          </button>
        </div>
      </form>
    </SheetShell>
  );
}
