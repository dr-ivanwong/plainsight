/**
 * The page rasteriser, as orchestration over an injected canvas: pdfjs
 * renders into whatever 2D context the runtime supplies (OffscreenCanvas in
 * the browser, a native canvas binding in Lambda), and the PNG comes back
 * base64 for the vision adapters. Structural types keep this testable
 * without a real canvas and keep the package free of DOM lib types.
 */

export interface RasterCanvas {
  /** A 2D rendering context pdfjs can draw into. */
  readonly context: object;
  toPngBase64(): Promise<string> | string;
}

export type CreateCanvas = (width: number, height: number) => RasterCanvas;

export interface RenderablePage {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: { canvasContext: object; viewport: object }): { promise: Promise<unknown> };
}

export interface PageSource {
  getPage(pageNumber: number): Promise<RenderablePage>;
}

/** Statement tables need legible digits; 2x the PDF point size reads well. */
const DEFAULT_SCALE = 2;

export function makePageRasteriser(
  source: PageSource,
  createCanvas: CreateCanvas,
  scale: number = DEFAULT_SCALE
): (pageNumber: number) => Promise<string> {
  return async (pageNumber) => {
    const page = await source.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.context, viewport }).promise;
    return canvas.toPngBase64();
  };
}
