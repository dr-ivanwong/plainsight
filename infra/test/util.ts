import { App } from 'aws-cdk-lib';

import type { EnvConfig } from '../config/types';

/**
 * An App for structural assertions: the bundling-stacks context set empty
 * skips esbuild for every NodejsFunction, because template shape is what
 * these tests pin and each real bundle costs seconds per app build. The
 * `pnpm synth` CI step still bundles everything for real, so a handler that
 * cannot bundle still fails the pipeline.
 */
export const testApp = (): App => new App({ context: { 'aws:cdk:bundling-stacks': [] } });

/**
 * The Phase 0/1 posture: every feature off. Prod flipped its Phase 2 flags at
 * go-live, but this posture stays under test because it is the rollback
 * target, and promises like zero compute belong to it.
 */
export const featuresOff = (base: EnvConfig): EnvConfig => ({
  ...base,
  features: { api: false, ingestion: false, extraction: false, sync: false, auth: false },
});
