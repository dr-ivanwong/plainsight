# 0001: Single AWS account, single environment, no standing staging

**Status:** Accepted · **Date:** 2026-07-10
**Deviates from:** the multi-account baseline (AWS Organizations, account-per-environment, SCP guardrails) and the universal practice of a standing staging environment before production. The [aws-cloud-engineer](../../.claude/skills/aws-cloud-engineer/SKILL.md) skill's right-sizing clause permits this, provided it is recorded. This is the record.

## Context

One user (the owner), one maintainer, cost as an explicit priority. A second account and a standing staging stack each add ops surface and cost that protect no second user. The architecture also provides unusual insurance: the client is local-first, so a bad backend deploy degrades online extras; it cannot break the app or touch on-device data.

## Decision

Run one AWS account with one environment (`prod`). No Organizations, no SCPs, no standing staging. Compensating controls replace what's given up:

- **PR-time `cdk diff`** posted as a comment: the diff is the review artefact.
- **CI-blocking invariant tests + cdk-nag**: security posture enforced structurally, not by a reviewer's memory.
- **IAM permission boundary** on the OIDC deploy role, standing in for SCPs.
- **Ephemeral rehearsal stacks** (`--context env=rehearsal`): a prefixed throwaway copy deployed for a day when a change deserves rehearsal, then destroyed.
- **GitHub environment gate** (one click) on changes touching the stateful `Data`/`Auth` stacks *(retired 2026-07-18; second amendment below)*; PITR + RETAIN + deletion protection on stateful resources.

## Alternatives considered

- **Two accounts (workloads + deploy) under Organizations**: the correct answer at team scale; here it doubles bootstrap and credential surface to protect a user who is also the only engineer.
- **Standing staging environment**: pays monthly rent and drift-maintenance for a safety net the local-first client already provides more cheaply.

## Consequences

Near-zero standing cost and one environment to reason about. The costs, accepted with eyes open: no always-on pre-prod bake; rehearsal copies can drift from prod between exercises; a compromised deploy role has account-wide reach bounded only by the permission boundary and the invariant suite.

## Revisit when

Anyone other than the owner gets credentials or uses the app; an incident occurs that a staging environment would plausibly have caught; or the permission boundary proves insufficient in an actual deploy-role compromise.

## Amendment: the one account is shared, not dedicated (2026-07-18)

At go-live the account (679345828813) turned out to carry the owner's other project tenants (each with its own tag-scoped budget and custom anomaly monitor), not to be dedicated to Plainsight. The single-account decision stands; its cost controls adapt to tenancy, following the account's own per-project convention:

- **The monthly budget filters to the project tag** (`user:project = plainsight`). An account-wide budget on a shared account would count the other tenants' spend and trip the kill switch on their activity.
- **The anomaly monitor is a custom, tag-scoped one** rather than the account-wide service-dimension monitor: AWS allows exactly one of those per account and the slot belongs to the account's existing monitor, which keeps serving every tenant.
- **Operational condition:** both controls measure nothing until `project` is activated as a cost-allocation tag in Billing (go-live step in the [runbook](../runbook.md)); activation is possible only after the first tagged spend appears and takes up to a day to reach filters.
- **Priced and accepted:** account-boundary isolation between Plainsight and the other tenants is policy, not a hard boundary; and the always-free DynamoDB arithmetic (cdk spec §8) weakens from guaranteed to best-effort, because the 25 RCU/WCU free tier is account-wide and other tenants may draw on it.

Revisit toward a dedicated account if the tenants multiply, the free-tier contention materialises on a bill, or any tenant's blast radius reaches another in practice.

**Full argument:** [plan/plainsight-cdk.md](../plan/plainsight-cdk.md) §2, §9.6.

## Amendment: the environment gate is retired (2026-07-18, recorded 2026-07-20)

The fifth compensating control above, the one-click gate on stateful-stack deploys, was built with the Auth stack, exercised twice, and removed the same day by owner decision: a gate that the sole operator always clicks themselves protects nothing and adds a pause to every `Data`/`Auth` deploy. What carries the load instead:

- **The structural protections on the stateful stacks**: RETAIN, deletion protection, and PITR, so data-loss-capable operations are blocked by construction rather than by review.
- **The CI-blocking invariant suite and cdk-nag**, unchanged, plus the weekly drift check.
- **The deploy role's trust**: exactly pushes to `main` of this repository. (The `environment:*` trust subject the gate needed was dropped on 2026-07-20 once nothing legitimate used it.)

Two facts recorded plainly rather than implied. First, `main` carries no branch protection (verified 2026-07-20), so the effective control on what reaches the deploy role is that only the owner can push to this repository: the single-user posture, priced here with eyes open, and the first thing to change if anyone else ever gets push access. Second, the Context paragraph's insurance ("a bad backend deploy... cannot break the app or touch on-device data") describes the local-first era; since the backend became the source of truth (main plan §12.9), that insurance is instead the client's synchronised working copy, its retry-until-accepted writes, and the structural protections above.

This amendment also settles the question the 2026-07-19 review posed as a plan tension: no human checkpoint exists on stateful deploys, deliberately, and this document now says so in the same breath as what replaced it.
