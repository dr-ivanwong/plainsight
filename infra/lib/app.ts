import { Tags, type App } from 'aws-cdk-lib';
import type { EnvConfig } from '../config/types';
import { FoundationStack } from './stacks/foundation';
import { GithubOidcStack } from './stacks/github-oidc';
import { StaticSiteStack } from './stacks/static-site';

export interface PlainsightStacks {
  foundation: FoundationStack;
  /** Absent on rehearsal copies: one-time scaffolding is never rehearsed (spec §3). */
  githubOidc: GithubOidcStack | undefined;
  staticSite: StaticSiteStack;
}

/**
 * Instantiates every stack the given config asks for. This is the one place
 * that turns config into stacks; bin/app.ts and the test suite both call it,
 * so what CI asserts is exactly what deploys.
 *
 * Spec §4 requirements handled here: env is pinned on every stack (no
 * environment-agnostic stacks: deterministic `cdk diff` or nothing) and the
 * project/env/owner tags are applied once, at the root.
 */
export function buildApp(app: App, config: EnvConfig): PlainsightStacks {
  const env = { account: config.account, region: config.region };
  // A rehearsal copy is the same code with prefixed names (spec §2); the
  // difference is data derived from envName, not a separate branch of stacks.
  const prefix = config.envName === 'rehearsal' ? 'Rehearsal' : '';

  Tags.of(app).add('project', 'plainsight');
  Tags.of(app).add('env', config.envName);
  Tags.of(app).add('owner', 'ivan');

  const foundation = new FoundationStack(app, `${prefix}Foundation`, { env, config });
  const githubOidc =
    config.envName === 'prod' ? new GithubOidcStack(app, 'GithubOidc', { env, config }) : undefined;
  const staticSite = new StaticSiteStack(app, `${prefix}StaticSite`, {
    env,
    config,
    // Prod gains the app pipeline's deploy role (a rehearsal copy has no
    // GithubOidc and no pipeline; it is deployed by hand and torn down).
    ...(githubOidc === undefined ? {} : { deployOidcProviderArn: githubOidc.providerArn }),
  });

  return { foundation, githubOidc, staticSite };
}
