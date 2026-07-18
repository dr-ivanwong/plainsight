import type { EnvConfig } from './types';

export const prod: EnvConfig = {
  envName: 'prod',

  // The one Plainsight account (ADR 0001: single account, single
  // environment), set 2026-07-18 for the Phase 2 go-live; an account id is
  // not a secret. Synth and the test suite never look anything up in it.
  account: '679345828813',

  region: 'ap-southeast-2',

  // Decided, spec §3: the default *.cloudfront.net origin. EdgeCert and
  // Route 53 never deploy while this is null; there is no code path for them.
  domain: null,

  // BYOK provider origins joined into the CSP connect-src (spec §6 pins the
  // equality invariant). Empty until a provider is actually configured.
  csp: { providerOrigins: [] },

  // Synth-time gates: a stack that is off does not exist (spec §1.2).
  // api and ingestion flipped on 2026-07-12 (Phase 2 go-live); extraction
  // joins in Phase 2.5, sync and auth in Phase 3. Distinct from the runtime
  // SSM flags the Foundation stack creates, which gate behaviour of
  // already-deployed compute.
  features: { api: true, ingestion: true, extraction: false, sync: false, auth: false },

  protectData: true,

  // monthlyAud is the owner's budget in AUD; killSwitchAt is the percentage
  // at which Phase 2's flipper Lambda disables extraction (spec §8).
  budgets: { monthlyAud: 20, killSwitchAt: 100 },

  github: { owner: 'dr-ivanwong', repo: 'plainsight' },
};

/**
 * Rehearsal overlay (spec §2): a throwaway same-account copy, deployed for a
 * day and destroyed. Differences from prod are data, not branches: the name
 * changes, data protection relaxes so teardown is a five-minute operation,
 * and everything else is inherited. Stack-name prefixing and the GithubOidc
 * skip (one-time scaffolding, spec §3) are derived from envName in lib/app.ts.
 */
export function rehearsalFrom(base: EnvConfig): EnvConfig {
  return { ...base, envName: 'rehearsal', protectData: false };
}
