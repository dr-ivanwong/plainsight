import { useState, type FormEvent, type ReactElement } from 'react';

import { parseEntryText } from '../../components/moneyEntry';
import { db, putPrice, type CompanyRecord } from '../../db';
import * as buttons from '../../styles/buttons.css';
import * as styles from './dashboard.css';

const localToday = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * The two valuation cards collapse into one enter-price card until a price
 * exists (frontend spec §3); on save they expand in place through the live
 * query. Price is a sibling record, not a line item. The practitioner table
 * seats the same component in its collapsed valuation row (dashboard design
 * plan §5.4).
 */
export function PriceCard({ company }: { company: CompanyRecord }): ReactElement {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parseEntryText(String(form.get('price') ?? ''), {
      scale: 'ones',
      unit: 'money',
      signed: false
    });
    const asOf = String(form.get('asOf') ?? '');
    if (!parsed.ok || parsed.minor === null || parsed.minor <= 0) {
      setError('Enter the share price as a positive amount.');
      return;
    }
    try {
      await putPrice(db, {
        companyId: company.id,
        amountMinor: parsed.minor,
        currency: company.currency,
        asOf
      });
    } catch {
      setError('Could not save the price.');
    }
  }

  return (
    <article className={styles.priceCard} aria-label="Enter today's price">
      <h3 className={styles.priceTitle}>Enter today&apos;s price</h3>
      <p className={styles.priceNote}>
        The two valuation measures need a share price in {company.currency}, the currency the
        statements report in. Where the market quotes another currency (CSL trades in AUD and
        reports in USD), convert before entering: the app never converts for you.
      </p>
      <form className={styles.priceForm} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.priceField}>
          <span className={styles.priceLabel}>Price</span>
          <input
            className={styles.priceInput}
            name="price"
            inputMode="decimal"
            autoComplete="off"
            required
          />
        </label>
        <label className={styles.priceField}>
          <span className={styles.priceLabel}>As of</span>
          <input
            className={styles.priceInput}
            name="asOf"
            type="date"
            defaultValue={localToday()}
            required
          />
        </label>
        <button type="submit" className={buttons.secondaryAction}>
          Save
        </button>
      </form>
      {error === null ? null : (
        <p role="alert" className={styles.priceError}>
          {error}
        </p>
      )}
    </article>
  );
}
