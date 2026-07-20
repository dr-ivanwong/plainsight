import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { acknowledgeNagFinding } from '../nag';

export interface GithubOidcStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * GithubOidc (spec §3, Phase 0, one-time scaffolding): the GitHub Actions
 * OIDC provider and the roles the pipelines assume. No long-lived
 * credentials exist anywhere in this project (spec §7).
 *
 * Two roles, two triggers, two ceilings. The deploy role serves pushes to
 * main and may assume the CDK bootstrap roles. The diff role serves
 * pull_request runs (whose OIDC subject the deploy role deliberately
 * refuses, keeping deploys main-only) and may assume only the read-side
 * lookup role, so a PR's diff can describe the deployed state and nothing
 * more. Neither holds service permissions of its own, and a permissions
 * boundary repeats each ceiling so a future "just add s3:PutObject" edit
 * cannot widen it (belt and braces, spec §2).
 */
export class GithubOidcStack extends Stack {
  readonly deployRole: iam.Role;
  readonly diffRole: iam.Role;
  /** The OIDC provider ARN, consumed by StaticSite's app-deploy role. */
  readonly providerArn: string;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);
    const { config } = props;

    // L1 CfnOIDCProvider, not the iam.OpenIdConnectProvider L2: the L2 is
    // backed by a Lambda custom resource, which would break the Phase 1
    // zero-compute invariant (and the test that pins it). The native
    // CloudFormation resource needs no compute (spec §5: L1 only where the
    // L2 cannot express it).
    const githubProvider = new iam.CfnOIDCProvider(this, 'GithubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIdList: ['sts.amazonaws.com'],
      // AWS validates GitHub's OIDC certificates against trusted root CAs and
      // ignores these thumbprints; CloudFormation still accepts the field, and
      // pinning the well-known values is harmless.
      thumbprintList: [
        '6938fd4d98bab03faadb97b34396831e3780aea1',
        '1c58a3a8518e8759bf075b76b750d4f2df264fcd',
      ],
    });
    this.providerArn = githubProvider.attrArn;

    // The CDK bootstrap roles all share the cdk- prefix (modern qualifier,
    // spec §2): cdk-<qualifier>-deploy-role-*, -file-publishing-role-*,
    // -image-publishing-role-*, -lookup-role-*.
    const cdkBootstrapRoles = `arn:aws:iam::${config.account}:role/cdk-*`;
    // A fresh statement per document: attached statements must not be shared.
    const assumeCdkRolesOnly = () =>
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRolesOnly',
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [cdkBootstrapRoles],
      });

    // The boundary is the SCP stand-in for a single-account setup (ADR 0001):
    // even if the role's identity policies grow, the effective permission
    // ceiling stays "assume the CDK roles, nothing else".
    const deployBoundary = new iam.ManagedPolicy(this, 'DeployRoleBoundary', {
      managedPolicyName: 'plainsight-deploy-boundary',
      description:
        'Permissions boundary for the GitHub Actions deploy role: sts:AssumeRole on the CDK bootstrap roles and nothing else.',
      statements: [assumeCdkRolesOnly()],
    });

    const repo = `${config.github.owner}/${config.github.repo}`;
    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'plainsight-github-deploy',
      description: `GitHub Actions OIDC deploy role for ${repo}; may only assume the CDK bootstrap roles.`,
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.attrArn, {
        // Trust ONLY this repository's pushes to main (the deploy trigger),
        // as an exact match. The retired stateful-stack approval gate used
        // to add an environment:* subject here; environments auto-create
        // unprotected on first use, so that pattern let any workflow on any
        // ref reach this role, and it left with the gate (spec §7,
        // amendment 2026-07-18).
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${repo}:ref:refs/heads/main`,
        },
      }),
      permissionsBoundary: deployBoundary,
    });
    this.deployRole.addToPolicy(assumeCdkRolesOnly());

    // Acknowledgements cover descendants (cdk-nag walks ancestor scopes), so
    // this also covers the role's DefaultPolicy child, where the statement
    // lands. IAM5 is a granular rule: the id names the exact finding, so the
    // acknowledgement is pinned to this one wildcard and cannot silently
    // absorb a future, wider one.
    acknowledgeNagFinding(
      this.deployRole,
      `AwsSolutions-IAM5[Resource::${cdkBootstrapRoles}]`,
      'The cdk-* wildcard is the entire grant, by design (spec §2): the CDK bootstrap roles ' +
        'carry a hashed qualifier in their names, so the prefix wildcard is the standard OIDC ' +
        'deploy pattern, and the permissions boundary pins the same ceiling.',
    );
    acknowledgeNagFinding(
      deployBoundary,
      `AwsSolutions-IAM5[Resource::${cdkBootstrapRoles}]`,
      'The permissions boundary must name the same cdk-* wildcard as the grant it bounds ' +
        '(spec §2, belt and braces); narrowing it would break CDK deploys, widening it would ' +
        'defeat the boundary.',
    );

    // The PR diff job authenticates separately: a pull_request-triggered run
    // presents the exact OIDC subject `repo:<repo>:pull_request`, which the
    // deploy role's trust deliberately does not match. Rather than widen the
    // deploy trust to PRs (anyone who can open a PR could then deploy), the
    // diff rides a read-only role whose entire reach is the CDK lookup role:
    // enough for `cdk diff` to read the deployed templates, not enough to
    // change anything. The lookup role's name is deterministic (default
    // bootstrap qualifier, as the smoke check in infra.yml already pins).
    const cdkLookupRole = `arn:aws:iam::${config.account}:role/cdk-hnb659fds-lookup-role-${config.account}-${config.region}`;
    const assumeCdkLookupRoleOnly = () =>
      new iam.PolicyStatement({
        sid: 'AssumeCdkLookupRoleOnly',
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [cdkLookupRole],
      });

    const diffBoundary = new iam.ManagedPolicy(this, 'DiffRoleBoundary', {
      managedPolicyName: 'plainsight-diff-boundary',
      description:
        'Permissions boundary for the GitHub Actions PR diff role: sts:AssumeRole on the CDK lookup role and nothing else.',
      statements: [assumeCdkLookupRoleOnly()],
    });

    this.diffRole = new iam.Role(this, 'DiffRole', {
      roleName: 'plainsight-github-diff',
      description: `GitHub Actions OIDC read-only diff role for ${repo} pull requests; may only assume the CDK lookup role.`,
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.attrArn, {
        // The pull_request subject is a fixed string (no ref, no wildcard),
        // so the trust is an exact StringEquals, the same shape as the
        // deploy role's.
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${repo}:pull_request`,
        },
      }),
      permissionsBoundary: diffBoundary,
    });
    this.diffRole.addToPolicy(assumeCdkLookupRoleOnly());

    new CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description:
        'Set the GitHub repository variable AWS_DEPLOY_ROLE_ARN to this value to activate the workflows.',
    });
    new CfnOutput(this, 'DiffRoleArn', {
      value: this.diffRole.roleArn,
      description:
        'Set the GitHub repository variable AWS_DIFF_ROLE_ARN to this value to activate the PR diff job.',
    });
  }
}
