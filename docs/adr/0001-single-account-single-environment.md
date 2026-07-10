# 0001: Single AWS account, single environment, no standing staging

**Status:** Accepted · **Date:** 2026-07-10
**Deviates from:** the multi-account baseline (AWS Organizations, account-per-environment, SCP guardrails) and the universal practice of a standing staging environment before production. The [aws-cloud-engineer](../../.claude/skills/aws-cloud-engineer/SKILL.md) skill's right-sizing clause permits this, provided it is recorded. This is the record.

## Context

One user (the owner), one maintainer, cost as an explicit priority. A second account and a standing staging stack each add ops surface and cost that protect no second user. The architecture also provides unusual insurance: the client is local-first, so a bad backend deploy degrades online extras; it cannot break the app or touch on-device data.

## Decision

Run one AWS account with one environment (`prod`). No Organizations, no SCPs, no standing staging. Compensating controls replace what's given up:

- **PR-time `cdk diff`** posted as a comment: the diff is the review artifact.
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

**Full argument:** [plan/plainsight-cdk.md](../plan/plainsight-cdk.md) §2, §9.6.
