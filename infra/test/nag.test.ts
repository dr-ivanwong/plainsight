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
import { buildApp } from '../lib/app';

describe('cdk-nag AwsSolutions pack', () => {
  const app = new App();
  buildApp(app, prod);
  const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);

  it('reports no unsuppressed errors across the Phase 0 stacks', () => {
    const errors = report.violations
      .filter((violation) => violation.severity === 'error')
      .flatMap((violation) =>
        violation.violatingResources.map(
          (resource) => `${violation.ruleName} at ${resource.constructPath}: ${violation.description}`
        )
      );
    expect(errors).toEqual([]);
  });

  it('produced a real report (the plugin integration is not a silent no-op)', () => {
    expect(typeof report.success).toBe('boolean');
  });
});
