// cdk-nag gate (spec §6, layer 1): the AwsSolutions pack runs over every
// stack the app can build, and any unacknowledged finding fails CI: the
// synth-time plugin conclusion turns on unacknowledged findings of every
// severity, so this suite holds itself to exactly that bar, warnings
// included. Acknowledgements live next to the resources they cover, each
// with a justification referencing the spec §8 not-list or an ADR; an
// unexplained acknowledgement is a defect.
//
// cdk-nag 3 is a CDK policy validation plugin (not an aspect); validateScope()
// is its direct test entry point and reports every violation with its
// construct path.
import { featuresOff, testApp } from './util';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { prod, rehearsalFrom } from '../config/prod';
import type { EnvConfig } from '../config/types';
import { buildApp } from '../lib/app';

function nagReport(config: EnvConfig) {
  const app = testApp();
  buildApp(app, config);
  return new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);
}

function unacknowledgedFindings(report: ReturnType<typeof nagReport>): string[] {
  return report.violations.flatMap((violation) =>
    violation.violatingResources.map(
      (resource) => `${violation.ruleName} at ${resource.constructPath}: ${violation.description}`
    )
  );
}

describe('cdk-nag AwsSolutions pack', () => {
  it('reports no unacknowledged findings across the prod stacks (Phase 2 flags on)', () => {
    const report = nagReport(prod);
    expect(unacknowledgedFindings(report)).toEqual([]);
    // The plugin integration is not a silent no-op.
    expect(typeof report.success).toBe('boolean');
  });

  it('reports no unacknowledged findings with every feature off (the rollback posture)', () => {
    const report = nagReport(featuresOff(prod));
    expect(unacknowledgedFindings(report)).toEqual([]);
  });

  it('reports no unacknowledged findings on the rehearsal overlay', () => {
    // The overlay relaxes data protection by design; every finding that
    // relaxation raises must carry its acknowledgement, or the rehearsal
    // synth step fails in CI while every local prod check stays green.
    const report = nagReport(rehearsalFrom(prod));
    expect(unacknowledgedFindings(report)).toEqual([]);
  });
});
