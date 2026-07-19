/**
 * The library export as a browser download. The data screen's export button
 * and the crash fallback's escape hatch (frontend spec section 2) share this
 * one path, so the same file lands and the same last-export bookkeeping runs
 * whichever surface asked for it.
 */
import { db as appDb, type PlainsightDb } from './db';
import { buildExport } from './exportFile';
import { setMeta } from './meta';

const localToday = (): string => {
  const now = new Date();
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Hands a text file to the browser; quietly a no-op where object URLs do not exist (tests). */
export function downloadText(text: string, filename: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Builds the export file, hands it to the browser, and records the export date. */
export async function downloadLibraryExport(
  appVersion: string,
  db: PlainsightDb = appDb
): Promise<void> {
  const file = await buildExport(db, appVersion);
  downloadText(JSON.stringify(file, null, 2), `plainsight-export-${localToday()}.json`);
  await setMeta(db, 'lastExportAt', new Date().toISOString());
}
