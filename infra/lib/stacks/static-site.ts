import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { acknowledgeNagFinding } from '../nag';

/**
 * The CSP served on every response (main plan §6; spec §6 pins the equality
 * invariant on connect-src). Built from config so the BYOK allowlist can
 * never silently widen: connect-src is exactly 'self' plus
 * config.csp.providerOrigins, in order. When features.api turns on in
 * Phase 2, a future change adds the API origin to this list (and the
 * invariant test's expectation in the same commit).
 */
function buildContentSecurityPolicy(config: EnvConfig): string {
  const connectSrc = ["'self'", ...config.csp.providerOrigins].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export interface StaticSiteStackProps extends StackProps {
  config: EnvConfig;
  /**
   * The GitHub OIDC provider ARN (from GithubOidc). When present, the stack
   * adds the app pipeline's deploy role: the infra deploy role can only
   * assume the CDK bootstrap roles (spec §2), so shipping built assets needs
   * its own, equally narrow identity. Absent on rehearsal copies, which skip
   * the one-time GithubOidc scaffolding.
   */
  deployOidcProviderArn?: string;
}

/**
 * StaticSite (spec §3, Phase 0/1): a private versioned S3 bucket behind a
 * CloudFront distribution with origin access control and the security
 * response headers. The running Phase 1 system is exactly this stack:
 * a bucket and a CDN, zero compute.
 *
 * No custom-domain code exists: config.domain is null by decision (spec §3,
 * the recorded one-way door), so EdgeCert and Route 53 have no code path
 * here at all.
 *
 * From Phase 2 this distribution gains a second origin/behaviour for
 * /v1/* to the API (spec §3); nothing else changes.
 */
export class StaticSiteStack extends Stack {
  readonly siteBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        // Versioning without lifecycle is a slow leak (spec §3): old deploys
        // stop billing after 30 days.
        { id: 'ExpireNoncurrentVersions', noncurrentVersionExpiration: Duration.days(30) },
      ],
      // Prod retains (spec §5: removal policies driven by config.protectData);
      // a rehearsal copy is disposable. autoDeleteObjects is deliberately NOT
      // used: it creates a custom-resource Lambda, which would break the
      // Phase 1 zero-compute invariant. Rehearsal teardown empties the bucket
      // first (aws s3 rm --recursive), a five-minute operation.
      removalPolicy: config.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `plainsight-${config.envName}-security-headers`,
      comment: 'Plainsight security headers; the CSP connect-src is pinned by the invariant tests.',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: buildContentSecurityPolicy(config),
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true }, // X-Content-Type-Options: nosniff
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Plainsight static site (${config.envName})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
      },
      defaultRootObject: 'index.html',
      // SPA routing: the router owns deep links, so both S3 "not found"
      // shapes (403 from OAC-denied listing, 404) serve the app shell.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Cheapest price class. AU users are served fine from its edges; for a
      // local-first PWA the CDN is touched on install and update, not on
      // every interaction, so the latency difference does not matter here.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // No logging, no WAF, no geo restriction: spec §8 not-list (ADR 0004);
      // suppressions with justifications below.
    });

    if (props.deployOidcProviderArn !== undefined) {
      this.addSiteDeployRole(config, props.deployOidcProviderArn);
    }

    Validations.of(this.siteBucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason:
        'No server access logging: spec §8 not-list (ADR 0004). Single user, public assets; an ' +
        'access-log bucket would only grow and watch nothing anyone reads.',
    });
    Validations.of(this.distribution).acknowledge(
      {
        id: 'AwsSolutions-CFR1',
        reason:
          'No geo restriction: the app serves public filing data to a single AU owner; geo blocking ' +
          'adds config surface and no protection (spec §8 posture, ADR 0004).',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason:
          'No WAF: pre-authorised suppression (spec §6). Single user, public data; abuse is handled ' +
          'by throttles and the budget kill switch, and WAF would cost more than the workload it ' +
          'watches (spec §8 not-list, ADR 0004).',
      },
      {
        id: 'AwsSolutions-CFR3',
        reason:
          'No access logging: spec §8 not-list (ADR 0004). The only user files his own bug reports; ' +
          'logs would be unread S3 spend.',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'The default *.cloudfront.net certificate pins the viewer TLS floor at TLSv1; raising it ' +
          'requires a custom domain and ACM certificate, decided against (spec §3, config.domain = ' +
          'null, the recorded one-way door).',
      },
      {
        id: 'AwsSolutions-CFR5',
        reason:
          'The only origin is S3 via origin access control, where transport is AWS-managed; there is ' +
          'no custom origin whose TLS protocols could be configured. Recorded alongside CFR4 for the ' +
          'default-certificate path (spec §3).',
      },
    );

    new CfnOutput(this, 'SiteBucketName', {
      value: this.siteBucket.bucketName,
      description: 'Deploy target for the app pipeline (aws s3 sync, then a CloudFront invalidation).',
    });
    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'For cache invalidations after an app deploy.',
    });
    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'The site origin: https://<this>.',
    });
  }

  /**
   * The app pipeline's identity (main plan §7): push to main builds the PWA,
   * syncs it to the site bucket, and invalidates the distribution. The role
   * can do exactly those three things and nothing else; the infra deploy role
   * cannot touch the bucket (it only assumes the CDK bootstrap roles), so the
   * two pipelines cannot reach into each other's blast radius.
   */
  private addSiteDeployRole(config: EnvConfig, providerArn: string): void {
    const repo = `${config.github.owner}/${config.github.repo}`;
    const siteDeployRole = new iam.Role(this, 'SiteDeployRole', {
      roleName: 'plainsight-site-deploy',
      description: `GitHub Actions role for ${repo}'s app pipeline: sync the built PWA and invalidate the cache.`,
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        // App deploys happen only from pushes to main; no environment gate.
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${repo}:ref:refs/heads/main`,
        },
      }),
    });
    siteDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ListSiteBucket',
        actions: ['s3:ListBucket'],
        resources: [this.siteBucket.bucketArn],
      })
    );
    const siteObjects = this.siteBucket.arnForObjects('*');
    siteDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SyncSiteObjects',
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [siteObjects],
      })
    );
    const distributionArn = this.formatArn({
      service: 'cloudfront',
      region: '', // CloudFront ARNs are global
      resource: 'distribution',
      resourceName: this.distribution.distributionId,
    });
    siteDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateDistribution',
        actions: ['cloudfront:CreateInvalidation'],
        resources: [distributionArn],
      })
    );
    // IAM5 granular finding: object-level S3 actions require the /* object
    // ARN; the bucket itself is the boundary. The finding id must be a plain
    // string (metadata keys cannot hold tokens), so it is built from the
    // bucket's allocated logical id in cdk-nag's flattened reference format;
    // if a refactor ever moves the bucket, the nag test fails loudly rather
    // than the acknowledgement silently detaching.
    const bucketLogicalId = this.getLogicalId(this.siteBucket.node.defaultChild as s3.CfnBucket);
    acknowledgeNagFinding(
      siteDeployRole,
      `AwsSolutions-IAM5[Resource::<${bucketLogicalId}.Arn>/*]`,
      'Object-level S3 actions require the bucket/* object ARN; the grant is scoped to the one ' +
        'site bucket and the three actions an asset sync needs (spec §7 app pipeline).',
    );

    new CfnOutput(this, 'SiteDeployRoleArn', {
      value: siteDeployRole.roleArn,
      description:
        'Set the GitHub repository variable AWS_SITE_DEPLOY_ROLE_ARN to this value to activate the app deploy job.',
    });
  }
}
