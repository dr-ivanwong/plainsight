/**
 * The PDF preprocessor subpath. Deliberately separate from the package root:
 * pdfjs is heavy, and consumers lazy-load this chunk (browser) or bundle it
 * only into the extraction Lambda.
 */
export { assembleLines, COLUMN_SEPARATOR, type TextItem } from './lines.js';
export { openPdf, textItemsOf, type PdfText } from './document.js';
export {
  SPARSE_PAGE_CHARS,
  locateStatements,
  pageSignals,
  type PageSignals,
  type StatementsWindow
} from './locator.js';
export {
  makePageRasteriser,
  type CreateCanvas,
  type PageSource,
  type RasterCanvas,
  type RenderablePage
} from './rasterise.js';
export { preprocessPdf, type PreprocessOptions, type PreprocessOutcome } from './preprocess.js';
