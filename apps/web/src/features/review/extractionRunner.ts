/**
 * The browser wiring for the in-page extraction job (frontend spec §6): the
 * PDF preprocessor with a canvas rasteriser (the browser's advantage over
 * the Lambda, which carries none), the cheap-first walk with keys looked up
 * from the device-local table, and the rung observer that feeds the honest
 * stage labels. Loaded lazily: nothing pays for pdfjs until a file is
 * actually chosen.
 */
import {
  ladderFor,
  runExtraction,
  type LadderOutcome,
  type PreparedDocument,
  type RegistryEntry
} from '@plainsight/extraction-core';
import {
  makePageRasteriser,
  preprocessPdf,
  type CreateCanvas,
  type PageSource
} from '@plainsight/extraction-core/pdf';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

import { providerIdFor } from '../settings/providers';
import type { JobDeps } from './jobStore';

GlobalWorkerOptions.workerSrc = workerUrl;

const createBrowserCanvas: CreateCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('canvas 2d context unavailable');
  return {
    context,
    toPngBase64: () => canvas.toDataURL('image/png').split(',')[1] ?? ''
  };
};

type PdfProxy = Awaited<ReturnType<typeof getDocument>['promise']>;

// pdfjs's render() types demand its full parameter object while the
// rasteriser's structural seam passes exactly the two fields pdfjs itself
// produced (a real 2d context and a real viewport); the cast bridges the
// static gap the runtime never had. Print intent because the output is a
// static PNG: display intent schedules its completion on animation frames,
// which a backgrounded tab throttles into a render that paints but never
// resolves.
const asPageSource = (proxy: PdfProxy): PageSource => ({
  getPage: async (pageNumber) => {
    const page = await proxy.getPage(pageNumber);
    return {
      getViewport: (params) => page.getViewport(params),
      render: (params) =>
        page.render({ ...params, intent: 'print' } as Parameters<typeof page.render>[0])
    };
  }
});

export interface BrowserJobOptions {
  /** providerId → stored key, from the device-local table. */
  readonly credentials: ReadonlyMap<string, string>;
  /** The provider the picker chose; its rungs walk first, the rest are the retry tail. */
  readonly providerId: string;
  /** The confidential toggle: paid, no-training rungs only (sensitivity routing, main plan §6). */
  readonly confidential: boolean;
}

export function browserJobDeps(options: BrowserJobOptions): JobDeps {
  return {
    async preprocess(bytes) {
      const loadingTask = getDocument({ data: bytes.slice(), useSystemFonts: true });
      const proxy = await loadingTask.promise;
      try {
        const rasterisePage = makePageRasteriser(asPageSource(proxy), createBrowserCanvas);
        return await preprocessPdf(bytes, { rasterisePage });
      } finally {
        await loadingTask.destroy();
      }
    },

    // The source peek's engine: one document held open for the job's life,
    // destroyed with it (jobStore owns the lifecycle).
    async makePageRenderer(bytes) {
      const loadingTask = getDocument({ data: bytes.slice(), useSystemFonts: true });
      const proxy = await loadingTask.promise;
      const rasterise = makePageRasteriser(asPageSource(proxy), createBrowserCanvas);
      return {
        render: async (pdfPage) => `data:image/png;base64,${await rasterise(pdfPage)}`,
        destroy: () => void loadingTask.destroy()
      };
    },

    ladderPlan(needsVision) {
      const keyed = ladderFor({ needsVision, confidential: options.confidential }).filter((entry) =>
        options.credentials.has(providerIdFor(entry))
      );
      return {
        chosen: keyed.filter((entry) => providerIdFor(entry) === options.providerId),
        remaining: keyed.filter((entry) => providerIdFor(entry) !== options.providerId)
      };
    },

    extract(
      document: PreparedDocument,
      ladder: readonly RegistryEntry[],
      onRung: (label: string) => void
    ): Promise<LadderOutcome> {
      return runExtraction({
        document,
        ladder,
        credentialFor: (entry) => {
          const key = options.credentials.get(providerIdFor(entry));
          if (key !== undefined) onRung(entry.label);
          return key;
        },
        adapterConfig: { timeoutMs: 100_000 }
      });
    }
  };
}
