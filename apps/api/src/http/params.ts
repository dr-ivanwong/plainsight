/**
 * Request-side parsing for the read routes. Failures return messages, not
 * throws: the handlers turn them into invalid_request envelopes.
 */
import { tickerSchema } from '@plainsight/api-contract';
import { STATEMENT_KINDS, type StatementKind } from '@plainsight/calc-engine';
import { z } from 'zod';

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** Path tickers arrive in whatever case the address bar had; the key design stores uppercase. */
export function parseTicker(raw: string | undefined): Parsed<string> {
  const result = tickerSchema.safeParse(raw?.toUpperCase());
  if (!result.success) {
    return { ok: false, message: 'Expected an exchange ticker like AAPL or BRK-B in the path.' };
  }
  return { ok: true, value: result.data };
}

export interface FinancialsQuery {
  years: number;
  statements: readonly StatementKind[];
}

const yearsSchema = z.coerce.number().int().min(1).max(10);

/** ?years=10&statements=income,balance,cashflow per the route table (backend spec §2). */
export function parseFinancialsQuery(
  raw: Record<string, string | undefined> | undefined
): Parsed<FinancialsQuery> {
  let years = 10;
  if (raw?.['years'] !== undefined) {
    const parsed = yearsSchema.safeParse(raw['years']);
    if (!parsed.success) {
      return { ok: false, message: 'years must be a whole number from 1 to 10.' };
    }
    years = parsed.data;
  }

  let statements: readonly StatementKind[] = STATEMENT_KINDS;
  if (raw?.['statements'] !== undefined) {
    const requested = raw['statements'].split(',').map((entry) => entry.trim());
    const known = new Set<string>(STATEMENT_KINDS);
    const unknown = requested.filter((entry) => !known.has(entry));
    if (unknown.length > 0 || requested.length === 0) {
      return {
        ok: false,
        message: 'statements must be a comma-separated subset of income, balance, cashflow.'
      };
    }
    statements = [...new Set(requested)] as StatementKind[];
  }

  return { ok: true, value: { years, statements } };
}
