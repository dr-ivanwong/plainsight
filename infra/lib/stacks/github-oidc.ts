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
 * OIDC provider and the deploy role the pipelines assume. No long-lived
 * credentials exist anywhere in this project (spec §7).
 *
 * The role deliberately holds no service permissions of its own: its only
 * grant is sts:AssumeRole on the CDK bootstrap roles (deploy, file-publishing,
 * lookup), and a permissions boundary repeats that ceiling so a future
 * "just add s3:PutObject" edit cannot widen it (belt and braces, spec §2).
 */
export class GithubOidcStack extends Stack {
  readonly deployRole: iam.Role;
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
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        // Trust ONLY this repository: pushes to main (the deploy trigger) and
        // GitHub-environment jobs (the stateful-stack approval gate, spec §7).
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${repo}:ref:refs/heads/main`,
            `repo:${repo}:environment:*`,
          ],
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

    new CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description:
        'Set the GitHub repository variable AWS_DEPLOY_ROLE_ARN to this value to activate the workflows.',
    });
  }
}
