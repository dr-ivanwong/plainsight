// config/types.ts: differences between prod and a rehearsal copy are data, not
// branches (docs/plan/plainsight-cdk.md §4).
export interface EnvConfig {
  envName: 'prod' | 'rehearsal';
  account: string;
  region: 'ap-southeast-2';
  domain: { zoneName: string; siteHost: string } | null; // null = *.cloudfront.net (see spec §3 one-way door)
  // The deployed origin, once known (null before the first deploy mints it).
  // Data, not a lookup: the hosted UI's OAuth redirects need a concrete URL
  // at synth time, and StaticSite deploys after Auth by dependency order.
  siteOrigin: string | null;
  csp: { providerOrigins: string[] }; // BYOK connect-src allowlist (main plan §6)
  features: { api: boolean; ingestion: boolean; extraction: boolean; sync: boolean; auth: boolean };
  protectData: boolean; // prod: true = RETAIN + PITR + deletionProtection; rehearsal: false
  budgets: { monthlyAud: number; killSwitchAt: number }; // killSwitchAt is a percentage; wired to a flipper Lambda in Phase 2 (spec §8)
  // Additive to the spec §4 sketch: the GithubOidc stack needs the repository
  // identity to build its trust-policy subject claims.
  github: { owner: string; repo: string };
}
