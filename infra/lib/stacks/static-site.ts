import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { distributionIdParameterName } from '../constants';
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
  /**
   * The API's execute-api hostname. When present (features.api on), the
   * distribution gains the /v1/* behaviours (cdk spec §3): the financials
   * path with the 6-hour edge cache, everything else passed through
   * uncached. Same origin as the app, so the CSP connect-src stays 'self'.
   */
  apiDomainName?: string;
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

    // SPA routing at the viewer request, scoped to the site behaviour:
    // extensionless app routes rewrite to the shell before the origin is
    // asked, so S3 never has to 404 for a deep link. The old distribution-wide
    // custom error responses would also have rewritten the API's not_found
    // envelopes into the shell, which is exactly the kind of silent contract
    // corruption the envelope tests exist to prevent.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      comment: 'Extensionless app routes serve the shell; assets and /v1/* pass through.',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          "  if (!request.uri.startsWith('/v1/') && !request.uri.includes('.')) {",
          "    request.uri = '/index.html';",
          '  }',
          '  return request;',
          '}',
        ].join('\n'),
      ),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Plainsight static site (${config.envName})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Cheapest price class. AU users are served fine from its edges; for a
      // local-first PWA the CDN is touched on install and update, not on
      // every interaction, so the latency difference does not matter here.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // No logging, no WAF, no geo restriction: spec §8 not-list (ADR 0004);
      // suppressions with justifications below.
    });

    if (props.apiDomainName !== undefined) {
      this.addApiBehaviours(config, props.apiDomainName, securityHeaders);
    }

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
          'S3 origin transport is AWS-managed via origin access control, and the API origin (when ' +
          'the feature is on) pins HTTPS-only with TLSv1.2 explicitly. Recorded alongside CFR4 for ' +
          'the default-certificate path (spec §3).',
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
   * The /v1/* behaviours (cdk spec §3; backend spec §2): the financials path
   * carries the 6-hour edge cache with the pipeline invalidating on write,
   * and this alone absorbs most read traffic at the edge (main plan §7);
   * everything else on /v1/* passes through uncached. CloudFront never
   * caches a 202, so a cold ticker's ingesting answer cannot get stuck at
   * the edge while the ingest completes.
   */
  private addApiBehaviours(
    config: EnvConfig,
    apiDomainName: string,
    securityHeaders: cloudfront.ResponseHeadersPolicy,
  ): void {
    const apiOrigin = new origins.HttpOrigin(apiDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    });
    const financialsCache = new cloudfront.CachePolicy(this, 'FinancialsCache', {
      cachePolicyName: `plainsight-${config.envName}-financials-cache`,
      comment: 'Financials change at most weekly per ticker; 6 hours at the edge, invalidated on write.',
      defaultTtl: Duration.hours(6),
      maxTtl: Duration.hours(6),
      minTtl: Duration.seconds(0),
      // The two query parameters shape the response, so they shape the key.
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('years', 'statements'),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const behaviourDefaults = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      // Forwards query strings and viewer headers minus Host, which API
      // Gateway needs to be its own.
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: securityHeaders,
    };
    // Insertion order is CloudFront precedence: the cached financials path
    // must land before the uncached catch-all.
    this.distribution.addBehavior('/v1/companies/*/financials', apiOrigin, {
      ...behaviourDefaults,
      cachePolicy: financialsCache,
    });
    this.distribution.addBehavior('/v1/*', apiOrigin, {
      ...behaviourDefaults,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      // The uncached catch-all carries the writable routes (sync push now;
      // uploads and extraction jobs later), so every method passes; the
      // cached financials behaviour above stays read-only.
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
    });

    // The ingest function reads this at runtime to invalidate after accepted
    // writes; by name, because this stack sits downstream of Api and can
    // never be referenced from the ingestion side (see constants.ts).
    new ssm.StringParameter(this, 'DistributionIdParameter', {
      parameterName: distributionIdParameterName(config.envName),
      stringValue: this.distribution.distributionId,
      description: 'Distribution fronting /v1/*; the ingest path invalidates financials through it.',
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
