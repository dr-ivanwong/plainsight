// cdk-nag gate (spec §6, layer 1): the AwsSolutions pack runs over every
// Phase 0 stack and any unsuppressed error fails CI. Suppressions live next
// to the resources they cover, each with a justification referencing the
// spec §8 not-list or an ADR; an unexplained suppression is a defect.
//
// cdk-nag 3 is a CDK policy validation plugin (not an aspect); validateScope()
// is its direct test entry point and reports every violation with its
// construct path.
import { App } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { prod } from '../config/prod';
import type { EnvConfig } from '../config/types';
import { buildApp } from '../lib/app';

function nagReport(config: EnvConfig) {
  const app = new App();
  buildApp(app, config);
  return new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);
}

function unsuppressedErrors(report: ReturnType<typeof nagReport>): string[] {
  return report.violations
    .filter((violation) => violation.severity === 'error')
    .flatMap((violation) =>
      violation.violatingResources.map(
        (resource) => `${violation.ruleName} at ${resource.constructPath}: ${violation.description}`
      )
    );
}

describe('cdk-nag AwsSolutions pack', () => {
  it('reports no unsuppressed errors across the Phase 0 stacks', () => {
    const report = nagReport(prod);
    expect(unsuppressedErrors(report)).toEqual([]);
    // The plugin integration is not a silent no-op.
    expect(typeof report.success).toBe('boolean');
  });

  it('reports no unsuppressed errors with the Phase 2 features on', () => {
    // Prod keeps the flags off until the phase goes live (spec §1.2); the
    // gate must hold for the stacks the flip will create, before it happens.
    const report = nagReport({ ...prod, features: { ...prod.features, api: true, ingestion: true } });
    expect(unsuppressedErrors(report)).toEqual([]);
  });
});
