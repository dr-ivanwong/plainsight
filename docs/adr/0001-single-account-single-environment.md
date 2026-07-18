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
- **GitHub environment gate** (one click) on changes touching the stateful `Data`/`Auth` stacks; PITR + RETAIN + deletion protection on stateful resources.

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
