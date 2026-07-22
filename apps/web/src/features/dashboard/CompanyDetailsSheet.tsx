import { useState, type FormEvent, type ReactElement } from 'react';

import { SheetShell } from '../../components/SheetShell';
import {
  db,
  isSectorId,
  SECTOR_IDS,
  SECTOR_LABELS,
  updateCompanyDetails,
  type CompanyRecord
} from '../../db';
import * as buttons from '../../styles/buttons.css';
import * as styles from './companyDetails.css';

/**
 * The company details sheet (frontend spec §3), open while `?details=1` is in
 * the URL and reached through the hero. Name and sector are the editable
 * half, sector through the vocabulary picker (data-model spec §12); ticker,
 * exchange and currency display fixed, a wrong identity or money field being
 * a re-create, not an edit.
 */
export function CompanyDetailsSheet({
  company,
  onClose
}: {
  company: CompanyRecord;
  onClose: () => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nameValue = form.get('name');
    const name = typeof nameValue === 'string' ? nameValue.trim() : '';
    const sectorValue = form.get('sector');
    const sector =
      typeof sectorValue === 'string' && isSectorId(sectorValue) ? sectorValue : undefined;
    try {
      const updated = await updateCompanyDetails(db, company.id, { name, sector });
      if (updated === null) throw new Error('no company to update');
      onClose();
    } catch {
      setError('Could not save the details. Check the name and try again.');
    }
  }

  const fixed = [
    { label: 'Ticker', value: company.ticker },
    { label: 'Exchange', value: company.exchange },
    { label: 'Currency', value: company.currency }
  ].filter((fact): fact is { label: string; value: string } => typeof fact.value === 'string');

  return (
    <SheetShell open onClose={onClose} label="Company details">
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <h2 className={styles.heading}>Company details</h2>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.input}
            name="name"
            required
            autoComplete="off"
            defaultValue={company.name}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Sector</span>
          <select className={styles.input} name="sector" defaultValue={company.sector ?? ''}>
            <option value="">None</option>
            {SECTOR_IDS.map((id) => (
              <option key={id} value={id}>
                {SECTOR_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        <dl className={styles.facts}>
          {fixed.map((fact) => (
            <div key={fact.label} className={styles.factRow}>
              <dt className={styles.factLabel}>{fact.label}</dt>
              <dd className={styles.factValue}>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.factsNote}>
          Ticker, exchange and currency are set when a company is created.
        </p>

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
            Save
          </button>
        </div>
      </form>
    </SheetShell>
  );
}
