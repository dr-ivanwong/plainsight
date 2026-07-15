import { describe, expect, it } from 'vitest';

import { makePageRasteriser, type RenderablePage } from '../src/pdf/index.js';

function fakePage(log: { renderedInto: object[] }): RenderablePage {
  return {
    getViewport: ({ scale }) => ({ width: 100.4 * scale, height: 200.2 * scale }),
    render: ({ canvasContext }) => {
      log.renderedInto.push(canvasContext);
      return { promise: Promise.resolve() };
    }
  };
}

describe('makePageRasteriser', () => {
  it('renders the page into a runtime-supplied canvas at the default scale', async () => {
    const log = { renderedInto: [] as object[] };
    const sizes: [number, number][] = [];
    const context = { fake2d: true };
    const rasterise = makePageRasteriser({ getPage: () => Promise.resolve(fakePage(log)) }, (width, height) => {
      sizes.push([width, height]);
      return { context, toPngBase64: () => 'UE5H' };
    });

    await expect(rasterise(3)).resolves.toBe('UE5H');
    expect(sizes).toEqual([[Math.ceil(200.8), Math.ceil(400.4)]]);
    expect(log.renderedInto).toEqual([context]);
  });

  it('honours a custom scale and an async PNG encoder', async () => {
    const log = { renderedInto: [] as object[] };
    const rasterise = makePageRasteriser(
      { getPage: () => Promise.resolve(fakePage(log)) },
      () => ({ context: {}, toPngBase64: () => Promise.resolve('QVNZTkM=') }),
      1
    );
    await expect(rasterise(1)).resolves.toBe('QVNZTkM=');
  });
});
