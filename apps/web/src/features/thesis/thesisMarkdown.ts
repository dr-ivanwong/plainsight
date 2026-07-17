import type { ThesisSections } from '../../db';

/** The four pinned sections in display order, as the export names them. */
const SECTION_ORDER: ReadonlyArray<{ key: keyof ThesisSections; label: string }> = [
  { key: 'business', label: 'Business' },
  { key: 'moat', label: 'Moat' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'kills', label: 'What kills it' }
];

/** Today in the house date form, from the writer's own clock. */
export function localToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The thesis as a portable Markdown document (main plan §12): the writer's
 * own words under the four pinned headings, unwritten sections left out.
 * Pure, so the file's exact shape is testable.
 */
export function thesisMarkdown(input: {
  name: string;
  ticker?: string | undefined;
  sections: ThesisSections;
  exportedOn: string;
}): string {
  const title =
    input.ticker === undefined || input.ticker === ''
      ? `# ${input.name} · Thesis`
      : `# ${input.name} (${input.ticker}) · Thesis`;
  const blocks = [title, `Exported ${input.exportedOn} from Plainsight.`];
  for (const { key, label } of SECTION_ORDER) {
    const text = input.sections[key].trim();
    if (text !== '') blocks.push(`## ${label}`, text);
  }
  return `${blocks.join('\n\n')}\n`;
}

/** `AAPL-thesis-2026-07-17.md`, falling back to a slug of the name when no ticker exists. */
export function thesisFileName(
  company: { name: string; ticker?: string | undefined },
  on: string
): string {
  const stem =
    company.ticker === undefined || company.ticker === ''
      ? company.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gu, '-')
          .replace(/^-+|-+$/gu, '')
      : company.ticker;
  return `${stem}-thesis-${on}.md`;
}
