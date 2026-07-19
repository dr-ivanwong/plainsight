import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { acknowledgeNagFinding } from '../nag';

export interface AuthStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * The hosted UI's deterministic home. The account id namespaces the prefix
 * and the environment keeps a rehearsal copy from colliding with prod in the
 * same account. Exported as pure functions of config (the same pattern as the
 * uploads bucket name) so StaticSite can name the origin in its CSP without a
 * stack dependency, and so the derivation exists exactly once.
 */
export const hostedUiDomainPrefix = (config: EnvConfig): string =>
  `plainsight-${config.envName}-${config.account}`;

/** The origin of the sign-in pages and the PKCE token endpoint the web app calls (spec §6). */
export const hostedUiOrigin = (config: EnvConfig): string =>
  `https://${hostedUiDomainPrefix(config)}.auth.${config.region}.amazoncognito.com`;

/**
 * Auth (spec §3, Phase 3): the Cognito user pool behind sync and the BYOK
 * proxy. Single-user by decision (main plan §2 audience): the one account is
 * created by the owner from the CLI (runbook, Phase 3 section), self-signup
 * stays off, and the hosted UI does the password handling so no form of ours
 * ever sees a credential. Stateful, so it lives alone and its deploys route
 * through the stateful-stack environment gate (spec §7).
 */
export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly webClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;

    if (config.siteOrigin === null) {
      // The hosted UI redirects somewhere concrete; before a first deploy has
      // minted the CloudFront origin there is nowhere to send a token.
      throw new Error('features.auth requires config.siteOrigin (the deployed origin) to be set');
    }

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `plainsight-${config.envName}`,
      // The Lite plan carries everything a single-user hosted-UI pool uses;
      // the paid tiers add fleet features (threat protection, passkeys) the
      // §8 not-list posture declines.
      featurePlan: cognito.FeaturePlan.LITE,
      // The spec §3 pin: no signup. The owner creates the one account by CLI.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      // TOTP only: SMS would create an SNS-publishing role and a phone
      // dependency for a pool with one owner-held account.
      mfaSecondFactor: { sms: false, otp: true },
      deletionProtection: config.protectData,
      removalPolicy: config.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    acknowledgeNagFinding(
      this.userPool,
      'AwsSolutions-COG2',
      'Single-user pool with signup off: the sole account is admin-created and owner-held, and ' +
        'TOTP enrolment stays available through the optional MFA setting without a redeploy. ' +
        'Requiring MFA is a fleet control on a pool with no fleet.'
    );
    acknowledgeNagFinding(
      this.userPool,
      'AwsSolutions-COG8',
      'The plus tier exists to protect a fleet of accounts and is paid; declined per the spec ' +
        '§8 not-list: one owner-held account, no signup surface, and route throttles plus the ' +
        'budget kill switch bound the abuse a stolen login could spend.'
    );

    // The hosted UI home; the shared derivation above is the one source of
    // the prefix, so the CSP's copy of the origin can never drift from it.
    const domain = this.userPool.addDomain('HostedUi', {
      cognitoDomain: { domainPrefix: hostedUiDomainPrefix(config) },
    });

    // The SPA client: public (no secret), authorisation-code flow only, and
    // redirects pinned to the deployed origin plus the local dev server. The
    // client slice narrows these to the exact callback route when it lands.
    const callbackUrls = [config.siteOrigin, 'http://localhost:5173'];
    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'plainsight-web',
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls,
        logoutUrls: callbackUrls,
      },
    });

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'The single-user pool; the API authoriser and the runbook reference it.',
    });
    new CfnOutput(this, 'WebClientId', {
      value: this.webClient.userPoolClientId,
      description: 'The public SPA client id (not a secret); the web app config carries it.',
    });
    new CfnOutput(this, 'HostedUiBaseUrl', {
      value: domain.baseUrl(),
      description: 'Where sign-in lives; Cognito hosts it, the app only redirects.',
    });
  }
}
