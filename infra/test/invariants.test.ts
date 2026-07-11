// Assertion tests pinning the spec §6 invariants for the Phase 0 stacks.
// These must survive any refactor; loosening one is a spec change, not a
// test fix.
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { prod, rehearsalFrom } from '../config/prod';
import { buildApp } from '../lib/app';
import { AUD_TO_USD_BUDGET_RATE, FEATURE_FLAGS } from '../lib/stacks/foundation';

// The tests construct the app directly from the typed prod config (account
// placeholder included): no credentials, no lookups, no CLI. What CI asserts
// here is exactly what `cdk synth` produces, because both call buildApp.
const app = new App();
const stacks = buildApp(app, prod);
if (!stacks.githubOidc) throw new Error('prod must synthesise the GithubOidc stack');
const templates: Record<string, Template> = {
  Foundation: Template.fromStack(stacks.foundation),
  GithubOidc: Template.fromStack(stacks.githubOidc),
  StaticSite: Template.fromStack(stacks.staticSite),
};
const foundation = templates['Foundation'] as Template;
const githubOidc = templates['GithubOidc'] as Template;
const staticSite = templates['StaticSite'] as Template;

/**
 * The one resource of its kind. Throws a plain Error (not an expect) because
 * some callers run at describe scope, during collection.
 */
function only<T>(record: Record<string, T>): T {
  const values = Object.values(record);
  if (values.length !== 1) {
    throw new Error(`expected exactly one matching resource, found ${values.length}`);
  }
  return values[0] as T;
}

describe('S3 buckets (spec §6: BLOCK_ALL + encryption + versioning)', () => {
  it('every bucket in every stack blocks public access, encrypts, and versions', () => {
    let bucketCount = 0;
    for (const template of Object.values(templates)) {
      for (const bucket of Object.values(template.findResources('AWS::S3::Bucket'))) {
        bucketCount += 1;
        const props = bucket['Properties'];
        expect(props.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        });
        expect(props.BucketEncryption.ServerSideEncryptionConfiguration).toBeDefined();
        expect(props.VersioningConfiguration).toEqual({ Status: 'Enabled' });
      }
    }
    // Phase 0 has exactly one bucket: the site bucket.
    expect(bucketCount).toBe(1);
  });

  it('the site bucket expires noncurrent versions after 30 days and is retained in prod', () => {
    staticSite.hasResourceProperties(
      'AWS::S3::Bucket',
      Match.objectLike({
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Status: 'Enabled',
              NoncurrentVersionExpiration: Match.objectLike({ NoncurrentDays: 30 }),
            }),
          ]),
        },
      }),
    );
    staticSite.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  });
});

describe('zero compute (the Phase 1 promise, spec §1.2)', () => {
  it.each(Object.keys(templates))('%s contains no Lambda functions', (name) => {
    const template = templates[name] as Template;
    expect(Object.keys(template.findResources('AWS::Lambda::Function'))).toEqual([]);
  });

  it.each(Object.keys(templates))('%s contains no custom resources', (name) => {
    // A custom resource means a hidden Lambda: BucketDeployment and the L2
    // iam.OpenIdConnectProvider are the classic ways one sneaks in.
    const template = templates[name] as Template;
    const resources: Record<string, { Type: string }> = template.toJSON().Resources ?? {};
    const customTypes = Object.values(resources)
      .map((resource) => resource.Type)
      .filter((type) => type.startsWith('Custom::') || type === 'AWS::CloudFormation::CustomResource');
    expect(customTypes).toEqual([]);
  });
});

describe('IAM wildcards (spec §6: no Action or Resource of literal *)', () => {
  // If a CDK-managed exception ever genuinely appears, allowlist it here as
  // '<StackName>/<LogicalId>' with a comment justifying it. Expect none in
  // these stacks.
  const WILDCARD_ALLOWLIST: ReadonlySet<string> = new Set([]);

  it('no policy statement anywhere carries Action: * or Resource: *', () => {
    const violations: string[] = [];
    for (const [stackName, template] of Object.entries(templates)) {
      const resources: Record<string, { Type: string; Properties?: any }> =
        template.toJSON().Resources ?? {};
      for (const [logicalId, resource] of Object.entries(resources)) {
        const props = resource.Properties ?? {};
        const documents: unknown[] = [];
        if (resource.Type === 'AWS::IAM::Role') {
          documents.push(props.AssumeRolePolicyDocument);
          for (const inline of props.Policies ?? []) documents.push(inline.PolicyDocument);
        }
        if (
          resource.Type === 'AWS::IAM::Policy' ||
          resource.Type === 'AWS::IAM::ManagedPolicy' ||
          resource.Type === 'AWS::S3::BucketPolicy' ||
          resource.Type === 'AWS::SNS::TopicPolicy'
        ) {
          documents.push(props.PolicyDocument);
        }
        for (const document of documents) {
          const statements: any[] = (document as any)?.Statement ?? [];
          for (const statement of statements) {
            for (const field of ['Action', 'Resource'] as const) {
              const values: unknown[] = [statement[field]].flat();
              if (values.includes('*') && !WILDCARD_ALLOWLIST.has(`${stackName}/${logicalId}`)) {
                violations.push(`${stackName}/${logicalId}: ${field} contains '*'`);
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('CSP (spec §6: the BYOK allowlist can never silently widen)', () => {
  const policy: any = only(staticSite.findResources('AWS::CloudFront::ResponseHeadersPolicy'));
  const csp: string =
    policy.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy
      .ContentSecurityPolicy;

  it("connect-src equals exactly 'self' plus config.csp.providerOrigins, in order", () => {
    const directives = new Map<string, string[]>(
      csp.split('; ').map((directive): [string, string[]] => {
        const [name, ...values] = directive.split(' ');
        return [name ?? '', values];
      }),
    );
    expect(directives.get('connect-src')).toEqual(["'self'", ...prod.csp.providerOrigins]);
  });

  it('the full policy matches the pinned directive set', () => {
    const expected = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src ${["'self'", ...prod.csp.providerOrigins].join(' ')}`,
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    expect(csp).toBe(expected);
  });

  it('the remaining security headers are present', () => {
    staticSite.hasResourceProperties(
      'AWS::CloudFront::ResponseHeadersPolicy',
      Match.objectLike({
        ResponseHeadersPolicyConfig: Match.objectLike({
          SecurityHeadersConfig: Match.objectLike({
            StrictTransportSecurity: Match.objectLike({
              AccessControlMaxAgeSec: 31536000,
              IncludeSubdomains: true,
              Override: true,
            }),
            ContentTypeOptions: Match.objectLike({ Override: true }),
            ReferrerPolicy: Match.objectLike({ ReferrerPolicy: 'strict-origin-when-cross-origin' }),
            FrameOptions: Match.objectLike({ FrameOption: 'DENY' }),
          }),
        }),
      }),
    );
  });
});

describe('OIDC deploy role (spec §2: assume the CDK roles, nothing else)', () => {
  const cdkBootstrapRoles = `arn:aws:iam::${prod.account}:role/cdk-*`;
  const expectedStatement = {
    Action: 'sts:AssumeRole',
    Effect: 'Allow',
    Resource: cdkBootstrapRoles,
    Sid: 'AssumeCdkBootstrapRolesOnly',
  };

  it('trusts only this repository, on main or a deploy environment', () => {
    const repo = `${prod.github.owner}/${prod.github.repo}`;
    githubOidc.hasResourceProperties(
      'AWS::IAM::Role',
      Match.objectLike({
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: [
            Match.objectLike({
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: {
                  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                },
                StringLike: {
                  'token.actions.githubusercontent.com:sub': [
                    `repo:${repo}:ref:refs/heads/main`,
                    `repo:${repo}:environment:*`,
                  ],
                },
              },
            }),
          ],
        }),
      }),
    );
  });

  it('carries the permissions boundary', () => {
    const role: any = only(githubOidc.findResources('AWS::IAM::Role'));
    const boundaryIds = Object.keys(githubOidc.findResources('AWS::IAM::ManagedPolicy'));
    expect(boundaryIds).toContain(role.Properties.PermissionsBoundary.Ref);
  });

  it('holds exactly one grant: sts:AssumeRole on the cdk-* roles', () => {
    const inlinePolicy: any = only(githubOidc.findResources('AWS::IAM::Policy'));
    expect(inlinePolicy.Properties.PolicyDocument.Statement).toEqual([expectedStatement]);
    const role: any = only(githubOidc.findResources('AWS::IAM::Role'));
    expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    expect(role.Properties.Policies).toBeUndefined();
  });

  it('the boundary pins the same ceiling', () => {
    const boundary: any = only(githubOidc.findResources('AWS::IAM::ManagedPolicy'));
    expect(boundary.Properties.PolicyDocument.Statement).toEqual([expectedStatement]);
  });
});

describe('site deploy role (main plan §7: the app pipeline ships assets, nothing else)', () => {
  const roles = staticSite.findResources('AWS::IAM::Role');
  const role: any = only(roles);

  it('trusts only this repository on main (no environment claim)', () => {
    const repo = `${prod.github.owner}/${prod.github.repo}`;
    expect(role.Properties.AssumeRolePolicyDocument.Statement).toEqual([
      expect.objectContaining({
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${repo}:ref:refs/heads/main`,
          },
        },
      }),
    ]);
  });

  it('grants exactly list, object sync, and one invalidation action', () => {
    const policy: any = only(staticSite.findResources('AWS::IAM::Policy'));
    const statements: any[] = policy.Properties.PolicyDocument.Statement;
    expect(statements.map((statement) => statement.Sid)).toEqual([
      'ListSiteBucket',
      'SyncSiteObjects',
      'InvalidateDistribution',
    ]);
    expect(statements[1].Action).toEqual(['s3:GetObject', 's3:PutObject', 's3:DeleteObject']);
    expect(statements[2].Action).toBe('cloudfront:CreateInvalidation');
    expect(role.Properties.ManagedPolicyArns).toBeUndefined();
  });

  it('does not exist on a rehearsal copy', () => {
    const rehearsalApp = new App();
    const rehearsal = buildApp(rehearsalApp, rehearsalFrom(prod));
    expect(
      Object.keys(Template.fromStack(rehearsal.staticSite).findResources('AWS::IAM::Role')),
    ).toEqual([]);
  });
});

describe('budget (spec §8: staged alerts on the converted AUD figure)', () => {
  const budget: any = only(foundation.findResources('AWS::Budgets::Budget'));

  it('notifies at 50, 80, and 100 percent of actual spend, to the alert topic', () => {
    const notifications: any[] = budget.Properties.NotificationsWithSubscribers;
    expect(notifications.map((entry) => entry.Notification.Threshold)).toEqual([50, 80, 100]);
    for (const entry of notifications) {
      expect(entry.Notification.NotificationType).toBe('ACTUAL');
      expect(entry.Notification.ThresholdType).toBe('PERCENTAGE');
      expect(entry.Subscribers).toHaveLength(1);
      expect(entry.Subscribers[0].SubscriptionType).toBe('SNS');
      // The address is the alert topic's ARN (a Ref to the topic).
      expect(entry.Subscribers[0].Address).toHaveProperty('Ref');
    }
  });

  it('is denominated in USD via the pinned conservative conversion', () => {
    expect(budget.Properties.Budget.BudgetLimit.Unit).toBe('USD');
    // The stack rounds to whole cents; compare at cent precision so a config
    // change to monthlyAud cannot fail on floating-point noise.
    expect(budget.Properties.Budget.BudgetLimit.Amount).toBeCloseTo(
      prod.budgets.monthlyAud * AUD_TO_USD_BUDGET_RATE,
      2,
    );
  });
});

describe('runtime feature flags (spec §3)', () => {
  it.each([...FEATURE_FLAGS])('/app/prod/features/%s exists and is false', (flag) => {
    foundation.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/app/prod/features/${flag}`,
      Type: 'String',
      Value: 'false',
    });
  });

  it('no other parameters exist', () => {
    expect(Object.keys(foundation.findResources('AWS::SSM::Parameter'))).toHaveLength(
      FEATURE_FLAGS.length,
    );
  });
});

describe('tagging (spec §4: project/env/owner at the root)', () => {
  const expectedTags = Match.arrayWith([
    { Key: 'env', Value: 'prod' },
    { Key: 'owner', Value: 'ivan' },
    { Key: 'project', Value: 'plainsight' },
  ]);

  it('reaches a taggable resource in every stack', () => {
    foundation.hasResourceProperties('AWS::SNS::Topic', Match.objectLike({ Tags: expectedTags }));
    githubOidc.hasResourceProperties('AWS::IAM::Role', Match.objectLike({ Tags: expectedTags }));
    staticSite.hasResourceProperties('AWS::S3::Bucket', Match.objectLike({ Tags: expectedTags }));
  });
});

describe('rehearsal overlay (spec §2: same code, prefixed names, disposable data)', () => {
  const rehearsalApp = new App();
  const rehearsal = buildApp(rehearsalApp, rehearsalFrom(prod));

  it('prefixes stack names and skips the one-time GithubOidc scaffolding', () => {
    expect(rehearsal.foundation.stackName).toBe('RehearsalFoundation');
    expect(rehearsal.staticSite.stackName).toBe('RehearsalStaticSite');
    expect(rehearsal.githubOidc).toBeUndefined();
  });

  it('relaxes data protection so teardown stays a five-minute operation', () => {
    Template.fromStack(rehearsal.staticSite).hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Delete',
    });
  });

  it('does not duplicate the account-level anomaly monitor (one per account)', () => {
    const rehearsalFoundation = Template.fromStack(rehearsal.foundation);
    expect(Object.keys(rehearsalFoundation.findResources('AWS::CE::AnomalyMonitor'))).toEqual([]);
    // The prod Foundation carries it.
    expect(Object.keys(foundation.findResources('AWS::CE::AnomalyMonitor'))).toHaveLength(1);
    expect(Object.keys(foundation.findResources('AWS::CE::AnomalySubscription'))).toHaveLength(1);
  });
});
