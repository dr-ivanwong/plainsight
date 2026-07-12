#!/usr/bin/env node
// Entry point (spec §4): picks the environment config, builds the stacks,
// and applies cdk-nag so `cdk synth` enforces the same gates as CI.
import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { prod, rehearsalFrom } from '../config/prod';
import { buildApp } from '../lib/app';

const app = new App();

// Rehearsal overlay (spec §2): `cdk deploy --context env=rehearsal` deploys a
// stack-prefixed throwaway copy into the same account for a day, then
// `cdk destroy --context env=rehearsal` removes it. The overlay is derived
// data (see config/prod.ts), not a second config file.
const requested: unknown = app.node.tryGetContext('env') ?? 'prod';
if (requested !== 'prod' && requested !== 'rehearsal') {
  throw new Error(`Unknown --context env=${String(requested)}; expected 'prod' or 'rehearsal'.`);
}
let config = requested === 'rehearsal' ? rehearsalFrom(prod) : prod;

// Verification overlay: `--context features=all` synthesises every
// feature-gated stack, so CI bundles every handler from source before any
// flag flips in prod (the structural tests skip bundling deliberately).
// Never deployed: it exists for `cdk synth` in the verify job.
if (app.node.tryGetContext('features') === 'all') {
  config = {
    ...config,
    features: { api: true, ingestion: true, extraction: true, sync: true, auth: true },
  };
}

// Phase 0 synthesises exactly three stacks and zero compute (spec §1.2, §3).
// Later phases attach in lib/app.ts, gated by config.features, in this order:
//   Phase 2:   DataStack (stateful, RETAIN + gate), ApiStack   <- features.api
//              IngestionStack                                  <- features.ingestion
//   Phase 2.5: extraction resources inside Ingestion           <- features.extraction
//   Phase 3:   AuthStack (stateful, RETAIN + gate), sync routes <- features.auth, features.sync
// EdgeCert (us-east-1) never deploys: config.domain is null by decision
// (spec §3, the recorded one-way door on the *.cloudfront.net origin).
buildApp(app, config);

// cdk-nag on every stack (spec §6, layer 1). cdk-nag 3 registers as a CDK
// policy validation plugin (no longer an aspect), so `cdk synth` fails on any
// unsuppressed finding; CI runs the same pack in test/nag.test.ts.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
