---
name: aws-cloud-infra-engineering
description: AWS infrastructure engineering discipline for this repo — Well-Architected principles applied through the project's CDK contract. Use this skill for ANY work touching AWS or infra — writing or reviewing CDK stacks/constructs in infra/, Lambda functions, DynamoDB, S3/CloudFront, API Gateway, IAM policies, SSM parameters, EventBridge/Step Functions, the GitHub Actions infra pipeline, cdk diff/deploy, cost or security questions, or scaffolding infra/ in Phase 0. Trigger even when the user doesn't say "AWS" but the task involves deploying, provisioning, secrets, budgets, or anything under infra/.
---

# AWS Cloud Infrastructure Engineering

## Order of authority

1. **[plan/buffet-app-cdk.md](../../../plan/buffet-app-cdk.md)** is the build contract — stack decomposition (§3), repo layout and config shape (§4), code conventions (§5), security gates (§6), pipelines (§7), cost guardrails and the not-list (§8). Read the relevant section before writing infra code.
2. This skill is the operating discipline: how to apply AWS best practices *within* that contract.
3. Generic AWS best practice loses to a recorded decision. This project deliberately excludes things AWS marketing calls essential (WAF, GuardDuty, CloudTrail trails, Secrets Manager, VPC — the §8 not-list) because at one user serving public data, each costs more than the workload it protects. Re-adding one is a design review with a cost line, never a reflex. If a decision genuinely must change, change the plan document in the same PR — code and contract never diverge.

## Well-Architected, sized for this project

The six pillars apply here, but resolved for a solo-maintainer, ~$0/month, single-account serverless app:

**Operational excellence — IaC-complete or it didn't happen.**
Every resource exists in CDK. Console changes are drift (the weekly `cdk diff` job is the tripwire); if you're tempted to click, write the construct instead. Small stacks are the unit of blast radius and deploy cadence: stateful (`Data`, `Auth`) apart from stateless (`Api`, `Ingestion`, `StaticSite`) so an API iteration can never touch the table holding data. The `cdk diff` posted to the PR *is* the review artifact — keep stacks small enough that diffs stay readable.

**Security — protect the wallet and the keys; the data is public.**
The threat model is inverted from a normal SaaS: filings are free on EDGAR, so the assets are AWS credentials, provider API keys, and the monthly bill. Concretely:
- Least-privilege IAM per function; no `Action: '*'` or `Resource: '*'` outside the two documented CDK-managed exceptions. Scope DynamoDB access by key-prefix condition where sensible.
- Secrets only as SSM SecureStrings referenced by name — never in code, CloudFormation state, env-var literals, or the client bundle.
- No long-lived AWS credentials anywhere: GitHub Actions assumes the OIDC role; the deploy role carries a permission boundary and can only assume the CDK roles.
- S3: `BlockPublicAccess.BLOCK_ALL` + encryption, always. CloudFront reaches the site bucket via OAC only.
- The CSP `connect-src` allowlist is invariant-tested to equal exactly config — it can never silently widen.

**Reliability — the client is the circuit breaker.**
The local-first frontend means a total backend failure degrades to a fully functional offline app; don't buy redundancy the architecture already provides for free. What's still owed: explicit timeout on every Lambda and every outbound call, exponential backoff + jitter on external fetches (EDGAR, MAP), DLQs with depth alarms so a poisoned filing's blast radius is one company, PITR + deletion protection on stateful prod resources, and idempotency on any mutation a flaky network can retry.

**Performance efficiency — serverless, ARM, short-and-fat.**
Everything pay-per-request: no containers, no ALB, nothing idling. Lambdas are `NodejsFunction`, Node 22, ARM64. Memory is a deliberate choice per function: 256MB floor for API/sync (128MB starves Node cold starts to save micro-cents), 1024–1536MB for rasterizing extraction work — per-millisecond billing makes short-and-fat cheaper than long-and-thin. No provisioned concurrency ever; a cold start on a single-user API is a non-problem.

**Cost optimization — the bill is a design input, not a surprise.**
Steady state is ≈ $0–4/month and stays there by construction: always-free tiers pinned deliberately (DynamoDB provisioned 25 RCU/25 WCU — ingestion paced under the ceiling), 30-day log retention (infinite retention is AWS's quietest leak), lifecycle rules on every versioned bucket, and Budgets wired to the SSM kill switch that disables extraction at threshold. Every proposed resource answers two questions before it exists: *does it idle?* (idling means it's the wrong shape for this workload) and *what's its monthly line?* (add it to the cost model if nonzero).

**Sustainability** falls out of the above: ARM64, scale-to-zero, no idle compute. Nothing extra to do.

## Task checklists

**Adding a resource:**
1. Which stack? Decide by blast radius and deploy cadence, not service category (§3 table). Stateful → `Data`/`Auth` behind the environment gate.
2. Removal policy from `config.protectData` — prod stateful gets RETAIN + deletion protection; rehearsal gets DESTROY.
3. Feature-flag it to its roadmap phase in config (`features.*`) — the app must never synthesize infrastructure ahead of the phase that needs it. Flags in config, not commented-out code.
4. Check the §8 not-list before adding any new AWS service.
5. New security-relevant property → pin it with an assertion test in `test/invariants.test.ts` so it survives refactors.

**Writing a Lambda:** `NodejsFunction`, Node 22, ARM64, explicit `timeout` (a missing timeout is a rejected PR), deliberate `memorySize`, `logRetention: 30 days`, X-Ray only on the ingestion path. Extract a shared construct on the second use, never the first — expected extractions are `AppFunction` and `AlarmedQueue`.

**Escape hatches and suppressions:** no L1 escape hatch without a comment explaining why the L2 couldn't express it. Every `cdk-nag` suppression carries an inline justification string; the WAF-family findings are pre-authorized with the not-list rationale.

**Before any deploy:** `pnpm test` (invariants + cdk-nag) → `cdk synth` → read the `cdk diff` yourself. Deploys go through the pipeline (`infra.yml`), not a laptop, once it exists. A change that deserves rehearsal gets an ephemeral `--context env=rehearsal` copy — deployed, verified, destroyed same-day. Rollback is redeploying the previous git ref.

## Environment facts

Single account, single environment (`prod` + ephemeral rehearsal overlays), region `ap-southeast-2` — the sole exception is a us-east-1 cert stack, and only if the custom-domain decision is ever reversed (currently `domain: null`, default `*.cloudfront.net` origin). Every stack pins `env: { account, region }`; tags (`project`, `env`, `owner`) applied once at the app root. Phase 1 synthesizes exactly `Foundation`, `GithubOidc`, `StaticSite` — a bucket and a CDN, zero compute, which is the point.
