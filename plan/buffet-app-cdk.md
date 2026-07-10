# AWS CDK Implementation Plan — v1 Specification

**Companion to:** `buffet-app.md` §7 (infrastructure decisions). **Status:** Draft for owner review · **Date:** July 2026
**Purpose:** the build contract for `infra/`. The main plan decided *what* runs (S3+CloudFront → serverless API → ingestion → auth) and *how it ships* (two accounts, OIDC, separate pipelines); this document decides how that is expressed in CDK: stack decomposition, environment wiring, code conventions, security invariants as tests, and the cost guardrails as code.

---

## 1. Governing principles (from the main plan, made concrete)

1. **Stacks are units of blast radius and deploy cadence, not service categories.** Stateful resources live apart from stateless ones so an API iteration can never touch the table holding data. Small stacks → fast, readable `cdk diff`s → the review artifact stays reviewable.
2. **Everything phased.** Each stack maps to a roadmap phase; Phase 1 synthesizes exactly two stacks and zero compute. The CDK app must never force infrastructure ahead of the phase that needs it (feature flags in config, not commented-out code).
3. **Zero VPC — a decision, not an omission.** Nothing in this architecture requires one: Lambda reaches DynamoDB, S3, and Secrets Manager over AWS endpoints with IAM; there is no RDS, no EC2, no container. No VPC means no NAT Gateway (~A$50+/month of pure tax), no subnet design, no ENI cold-start penalty, and one entire class of misconfiguration deleted. If a future component demands a VPC, that's a design review, not a default.
4. **Secrets never touch code or state.** The canonical pipeline's provider keys live in **SSM Parameter Store as SecureStrings** (standard tier — free, KMS-encrypted with the AWS-managed key), created out-of-band and referenced by name; CDK code and CloudFormation state contain parameter names only. Secrets Manager was traded out deliberately (US$0.40/secret/month for rotation automation these personal keys don't use — see §8's not-list); wanting automated rotation is the trigger to move back.

## 2. Account, region, bootstrap

- **One account, one environment** (owner's decision — single user, cost priority). No Organizations, no standing staging. The SCP guardrails are replaced by an **IAM permission boundary** on the deploy role plus the §6 invariant tests; the staging safety net is replaced by three cheaper controls: PR-time `cdk diff` review, **ephemeral rehearsal stacks** (`--context env=rehearsal` deploys a stack-prefixed throwaway copy into the same account for a day, then `cdk destroy`), and the local-first client itself — a bad backend deploy degrades online extras, it cannot break the app or touch on-device data.
- **Primary region: `ap-southeast-2` (Sydney)** — the owner is the sole user; latency to Sydney is the only latency that matters. **Exception:** if a custom domain is chosen, CloudFront requires its ACM certificate in `us-east-1`, so a dedicated cert stack lives there (§3) with `crossRegionReferences: true` — the classic CDK gotcha, handled explicitly rather than discovered at 11pm.
- **Bootstrap:** `cdk bootstrap` the one account with the modern qualifier; the GitHub OIDC deploy role (§7) is trusted to assume only the CDK deploy/file-publishing roles — it holds no direct service permissions of its own, and carries the permission boundary.

## 3. Stack decomposition

| Stack | Region | Phase | Contents | Stateful | Prod policy |
|---|---|---|---|---|---|
| `Foundation` | syd | 0 | Budgets + SNS alert topic, cost-anomaly monitor, SSM feature-flag parameters (`/app/{env}/features/*`), shared log-retention defaults | no | — |
| `GithubOidc` | syd | 0 | One-time: OIDC provider + deploy role trusting `repo:owner/repo` on protected branches, assume-cdk-roles only | no | — |
| `EdgeCert` *(custom-domain mode only)* | **us-east-1** | 1 | ACM certificate for CloudFront | no | RETAIN |
| `StaticSite` | syd | 1 | Private versioned S3 site bucket (noncurrent versions expire after 30 days — versioning without lifecycle is a slow leak), CloudFront distribution + OAC, **response-headers policy (the CSP — including the BYOK `connect-src` provider allowlist from config)**, Route 53 records *(custom-domain mode only)*. From Phase 2 the same distribution gains a second origin/behavior: `/v1/*` → API (6h edge cache on financials) | site bucket | RETAIN bucket |
| `Data` | syd | 2 | DynamoDB single table — **provisioned 25 RCU / 25 WCU, inside the always-free tier** (ingestion writes paced under the ceiling; burst capacity absorbs the rest). Phase 3 adds: PITR + deletion protection, uploads bucket (7-day lifecycle, CORS for presigned PUT) | **yes** | RETAIN + protection |
| `Api` | syd | 2 | HTTP API Gateway (access logs on, retention set), read Lambdas; Phase 3 adds sync routes + BYOK proxy pass-through; Cognito authorizer attached where flagged | no | — |
| `Ingestion` | syd | 2/2.5 | EventBridge **weekly** sweep (watched tickers only) + on-demand invoke path, Step Functions (map over changed filings, concurrency 1–2 to stay under the WCU ceiling, per-item catch), ingestion/normalizer/extraction Lambdas, SQS DLQ, alarms (DLQ depth > 0, sweep failure), SSM SecureString references for the canonical pipeline's provider keys | DLQ only | — |
| `Auth` | syd | 3 | Cognito user pool — single admin-created user, no signup, hosted UI | user pool | RETAIN |

**Dependency graph:** `EdgeCert → StaticSite`; `Data → Api`; `{Foundation, Data} → Ingestion`; `Auth → Api`. `Foundation` and `GithubOidc` precede everything. No cycles, no cross-stack spaghetti: exports are limited to the cert ARN, table name/ARN, bucket names, user-pool id.

**Phase mapping honesty check:** Phase 1 = `Foundation + GithubOidc + EdgeCert + StaticSite`. Two of those are one-time scaffolding. The running system is a bucket and a CDN — exactly the "no backend" promise, now enforced by what the app can even synthesize (feature flags gate `Data/Api/Ingestion/Auth` instantiation per environment config).

**Domain decision — resolved: the default `*.cloudfront.net` origin** (owner's call, July 2026). HTTPS included, PWA-installable, and `EdgeCert` + Route 53 never deploy (`config.domain = null`). The one-way door stands recorded rather than open: **IndexedDB is bound to the origin**, so any later move to a custom domain means a manual export → import and a PWA re-install on each device — survivable because one-tap export exists, but a chore accepted with eyes open. The realistic trigger to revisit is the legal-tripwire event of sharing the app, which forces a naming pass anyway.

## 4. Repository layout and configuration

```
infra/
  bin/app.ts                 # instantiates stacks per env from typed config
  lib/stacks/                # one file per stack above
  lib/constructs/            # extracted on 2nd use only (see conventions)
  config/
    types.ts                 # EnvConfig interface
    prod.ts                  # the single environment; rehearsal copies via --context overlay
  test/
    invariants.test.ts       # §6 security assertions
    snapshots/               # judicious snapshot tests
```

```ts
// config/types.ts — differences between prod and a rehearsal copy are data, not branches
export interface EnvConfig {
  envName: 'prod' | 'rehearsal';
  account: string;
  region: 'ap-southeast-2';
  domain: { zoneName: string; siteHost: string } | null;  // null = *.cloudfront.net (see §3 one-way door)
  csp: { providerOrigins: string[] };            // BYOK connect-src allowlist (main plan §6)
  features: { api: boolean; ingestion: boolean; extraction: boolean; sync: boolean; auth: boolean };
  protectData: boolean;                          // prod: true → RETAIN + PITR + deletionProtection; rehearsal: false
  budgets: { monthlyAud: number; killSwitchAt: number };
}
```

`bin/app.ts` pins `env: { account, region }` on every stack (no environment-agnostic stacks — deterministic `cdk diff` or nothing) and applies `Tags.of(app).add('project' | 'env' | 'owner')` once, at the root.

## 5. Code conventions

- **Lambdas:** `NodejsFunction` (esbuild bundling), Node 22 (the active LTS — Node 20 is maintenance-only in 2026; new projects start on 22), **ARM64** (Graviton — cheaper, no downside here), explicit `timeout` on every function (a missing timeout is a rejected PR), `memorySize` deliberate per function, `logRetention: 30 days` — the default of *infinite* log retention is the quietest cost leak in AWS. X-Ray tracing on the ingestion path only.
- **Compute sizing floor:** 256MB default for API/sync functions (128MB is tempting but Node cold starts suffer for savings measured in micro-cents); 1024–1536MB burst for the rasterizing extraction Lambda — per-millisecond billing makes short-and-fat cheaper than long-and-thin. **No provisioned concurrency, ever** — a cold start on a single-user API is a non-problem — and no containers exist anywhere in this architecture to size in the first place.
- **Constructs:** extract a shared construct on the **second** use, never the first (code is a liability). Expected extractions by Phase 2: `AppFunction` (the Lambda defaults above) and `AlarmedQueue` (queue + DLQ + depth alarm).
- **Removal policies:** driven by `config.protectData` — prod stateful resources get `RemovalPolicy.RETAIN` + deletion protection + PITR; staging gets `DESTROY` so teardown/rebuild stays a five-minute operation and the IaC-complete-rebuild claim is actually exercised.
- **No L1 escape hatches without a comment** explaining why the L2 couldn't express it; escape hatches are where drift and surprise live.

## 6. Security and quality gates as code

Two layers, both CI-blocking:

1. **`cdk-nag`** with the AwsSolutions pack on every stack. Suppressions require an inline justification string — an unexplained suppression fails review by convention. The WAF-related findings (e.g., AwsSolutions-CFR2 on CloudFront, the API Gateway WAF rules) are **pre-authorized suppressions** with the §8 not-list justification: single user, public data, abuse handled by throttles and the budget kill switch.
2. **Assertion tests** (`Template.fromStack`) pinning the invariants that must survive any refactor:
   - every S3 bucket: `BlockPublicAccess.BLOCK_ALL` + encryption + (site bucket) versioning;
   - every Lambda: timeout present, log retention present, ARM64;
   - prod `Data` stack: PITR enabled, deletion protection enabled;
   - no IAM policy statement with `Action: '*'` or `Resource: '*'` outside the two documented CDK-managed exceptions;
   - the CloudFront response-headers policy's CSP `connect-src` equals exactly `['self', apiOrigin, ...config.csp.providerOrigins]` — the BYOK allowlist can never silently widen;
   - every API route flagged `auth: true` in the route table has the Cognito authorizer attached.

Snapshot tests exist for `StaticSite` and `Data` only — the stacks where unnoticed template churn is most dangerous — reviewed on change rather than blindly regenerated.

## 7. Pipelines (GitHub Actions, OIDC — no long-lived credentials)

**Infra pipeline** (`infra.yml`), separate from the app pipeline per main plan §7:

- **On PR:** `pnpm test` (assertions + nag) → `cdk synth` → `cdk diff` against prod, posted as a PR comment. The diff is the review.
- **On merge to main:** stateless stacks deploy straight to prod via the OIDC role → smoke checks (site 200s, API health, table describe). Changes touching `Data` or `Auth` route through a **GitHub environment gate** — one click, the only ceremony left. When an infra change deserves rehearsal, deploy a `rehearsal` overlay copy first (§2), verify, destroy.
- **Weekly drift job:** scheduled `cdk diff` against prod; a non-empty diff opens an issue. Console-clicked infrastructure is technical debt from the moment it's created — this is the tripwire.

Rollback: stacks are small, so rollback = redeploy the previous git ref (< 5 min). Stateful stacks change rarely and behind the approval gate; data-loss-capable operations are structurally blocked by RETAIN + deletion protection.

## 8. Cost guardrails as code

- **DynamoDB provisioned at 25 RCU / 25 WCU — inside the always-free tier — so the table costs $0 forever at this scale.** On-demand was the "traffic unknown" default; at one user, traffic is known: negligible. Ingestion writes are paced under the ceiling (Step Functions map concurrency 1–2) and burst capacity absorbs the rest. PITR (Phase 3) bills ~$0.20/GB-month on a table measured in megabytes — pennies. Revisiting on-demand requires a traffic pattern this product cannot generate.
- **Budgets → kill switch, wired end-to-end:** AWS Budgets (monthly, `config.budgets.monthlyAud`) alerts to SNS at 50/80/100%; at the `killSwitchAt` threshold, a 10-line Lambda flips `/app/{env}/features/extraction` to `false` in SSM. The extraction and proxy Lambdas read the flag per invocation (60s cache) and return a clean "temporarily disabled" error the client already knows how to render. Budgets can't cap AWS spend — but this converts an overspend alert into an automatic stop for the only component that can spend meaningfully.
- **Cost anomaly detection** on both accounts, alerting to the same SNS topic.
- The zero-VPC decision (§1.3) *is* the largest single cost guardrail: no NAT, no idle anything. Expected steady-state infra bill matches the main plan's model (§11).

### What's deliberately absent — the not-list

At one user serving public filings, the threat model inverts: the asset worth stealing isn't the data (it's free on EDGAR), it's **the wallet and the keys**. Every retained control protects one of those two or costs nothing; everything below is consciously excluded, written down so a future "best practice" reflex can't quietly re-add A$50+/month:

- **ALB** — never existed here; there is nothing to load-balance. CloudFront → S3 and API Gateway → Lambda are pay-per-request. An idle ALB alone (~US$16+/month before LCUs) would exceed this app's entire projected bill.
- **WAF** (~US$5/month + per-rule + per-request) — the readable surface is public data behind edge caching; the writable/spendable surfaces (sync, BYOK proxy, extraction) sit behind Cognito and the SSM kill-switch flag. Bot noise is absorbed by API Gateway route throttles (free — set low, ~10 rps) and, in the limit, the budget kill switch. This is also a *cost* control: throttles cap the bill a scraper loop could ever generate.
- **VPC / NAT Gateway** — already a §1.3 decision; restated because NAT is the classic silent ~A$50+/month.
- **GuardDuty, Security Hub, AWS Config** — worthy at org scale; here each would cost more than the workload it watches. The invariant tests and the weekly drift job are the configuration police.
- **KMS customer-managed keys** — US$1/month each for zero gain at this scale; AWS-managed encryption everywhere (S3, DynamoDB, SSM SecureString default key).
- **Secrets Manager** — replaced by free SSM SecureStrings (§1.4). Automated rotation is the trigger to reverse this.
- **Shield Advanced, Route 53 health checks, multi-region anything** — no.
- **A CloudTrail trail** — the free 90-day event history covers a single-account personal project; a configured trail adds S3 log storage that only grows. Revisit if anyone else ever gets credentials.
- **Paid frontend monitoring** (CloudWatch RUM, APM, Chromatic) — the only user files his own bug reports; visual regression rides free Playwright screenshots; free-tier Sentry is the optional ceiling.

**Audited and deliberately kept (the cuts that aren't worth it):** API Gateway → Lambda Function URLs would save cents per million requests while losing the Cognito authorizer, access logs, and route throttles; Step Functions Standard → Express saves similar cents at this volume; and the 2–3 CloudWatch alarms ($0.10/month each) stay because they *are* the kill-switch path and DLQ visibility — the last thirty cents on the bill buy the entire cost-protection mechanism. The audit bottoms out here: remaining spend is the optional domain and per-filing extraction, both variable, both chosen.

What stays, and why it stays at ≈ $0: S3 Block Public Access (prevents the bucket becoming someone's free file host), least-privilege IAM, TLS everywhere (built into CloudFront and API Gateway), the CSP, API throttles, the budget kill switch, and **Cognito on sync and the BYOK proxy** — the one precision worth keeping in view: "the data is public" is true of the filings, but Phase 3 sync carries the owner's *theses and notes*, which are not, and an unauthenticated key-relay proxy is an abuse magnet regardless of data sensitivity. Both are protected by controls that cost nothing, so the cheap posture and the correct posture happen to be the same posture.

## 9. Alternatives considered

1. **CDK Pipelines (self-mutating CodePipeline).** Rejected: powerful for teams, but the self-mutation model and CodePipeline plumbing are overhead a solo project pays daily; GitHub Actions + OIDC delivers the same guarantees with the tooling already in use.
2. **Terraform.** Rejected in the main plan; reaffirmed here — one language (TypeScript) end to end, with Zod schemas, calc engine, Lambdas, and infra sharing types and tooling.
3. **SST.** Attractive DX (live Lambda dev), rejected: a framework layer on top of CDK is one more dependency with its own churn on a project designed to survive neglect. Revisit only if Lambda-side iteration speed genuinely hurts.
4. **One monolithic stack per environment.** Rejected: unreadable diffs, maximal blast radius, and stateful/stateless coupling — the exact failure modes stack decomposition exists to prevent.
5. **LocalStack for local infra testing.** Rejected: assertion tests catch structural errors, staging catches behavioral ones; emulator fidelity chasing is time this project doesn't have.
6. **A standing staging environment.** Rejected on the owner's call — single user, cost priority. Replaced by three cheaper controls: PR-time `cdk diff` + the invariant suite, ephemeral rehearsal stacks torn down same-day, and the local-first client itself, which converts a bad backend deploy into degraded online extras rather than a broken app or lost data.

## 10. Phase 0 CDK checklist (the concrete first-week list)

Create (or reuse) the one AWS account → bootstrap → deploy `GithubOidc` + `Foundation` (budgets live before anything can spend) → `StaticSite` with a hello-world index on the default CloudFront origin (domain decided — §3; `EdgeCert` never deploys) → wire `infra.yml` end to end including the stateful-stack gate → confirm the weekly drift job runs → tag check in Cost Explorer. Exit criterion: a change to the CSP allowlist in `config/prod.ts` flows PR → diff comment → prod **without any console interaction**, and the invariants suite fails if someone tries to add a public bucket.

---

*Review focus for the owner: the zero-VPC decision (§1.3), the stack boundaries and RETAIN policies (§3), the CSP-equality invariant (§6), and the budget-to-kill-switch wiring (§8) — these carry the operational opinions. The domain question is decided and recorded in §3.*
