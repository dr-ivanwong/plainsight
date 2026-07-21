/**
 * The pinned sector vocabulary (data-model spec §12): a company carries an id
 * from this list or none at all, the library groups under the labels in this
 * order, and absence is the unclassified state, never a sentinel value.
 * Extension is a one-line amendment to the spec's table before it is a code
 * change; no freestyle values exist anywhere.
 */

export const SECTOR_IDS = [
  'healthcare',
  'technology',
  'banks',
  'retail',
  'resources',
  'property',
  'industrials',
  'insurance'
] as const;

export type SectorId = (typeof SECTOR_IDS)[number];

/** Code writes the id; this mapping is the one place the section label comes from (main plan §12 entry 8). */
export const SECTOR_LABELS: Record<SectorId, string> = {
  healthcare: 'Healthcare',
  technology: 'Technology',
  banks: 'Banks',
  retail: 'Retail',
  resources: 'Resources',
  property: 'Property',
  industrials: 'Industrials',
  insurance: 'Insurance'
};

export const isSectorId = (value: string): value is SectorId =>
  (SECTOR_IDS as readonly string[]).includes(value);

/**
 * Every sector string the app ever wrote (the sample five's descriptive
 * strings, mapped per the spec's sample-mapping call) plus the ids and labels
 * themselves, matched case-blind so a hand-typed "retail" or "Banks" lands.
 * Every label lowercases to its own id, so only the retired strings need
 * spelling out.
 */
const KNOWN_SECTORS: ReadonlyMap<string, SectorId> = new Map([
  ...SECTOR_IDS.map((id) => [id, id] as const),
  ['medical devices', 'healthcare'],
  ['conglomerate', 'retail'],
  ['consumer staples', 'retail']
]);

/**
 * Free text in, vocabulary out (data-model spec §12): known strings map to
 * their id, anything else clears to absent for one-tap reassignment through
 * the details sheet. Runs inside the company record schema, so every read
 * boundary (Dexie-on-read, sync pull, file import) normalises and a company
 * row never quarantines over a cosmetic label.
 */
export function normaliseSector(value: string): SectorId | undefined {
  return KNOWN_SECTORS.get(value.trim().toLowerCase());
}
