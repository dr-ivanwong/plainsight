import { App } from 'aws-cdk-lib';

/**
 * An App for structural assertions: the bundling-stacks context set empty
 * skips esbuild for every NodejsFunction, because template shape is what
 * these tests pin and each real bundle costs seconds per app build. The
 * `pnpm synth` CI step still bundles everything for real, so a handler that
 * cannot bundle still fails the pipeline.
 */
export const testApp = (): App => new App({ context: { 'aws:cdk:bundling-stacks': [] } });
