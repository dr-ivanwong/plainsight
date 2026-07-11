import type { Provenance } from '@plainsight/calc-engine';

/** Where a figure came from, in plain words; shared by entry headers and provenance chips. */
export const SOURCE_WORD: Readonly<Record<Provenance['source'], string>> = {
  manual: 'entered by hand',
  sample: 'sample data',
  edgar: 'EDGAR filing',
  asx_map: 'ASX filing',
  user_upload: 'uploaded document'
};
