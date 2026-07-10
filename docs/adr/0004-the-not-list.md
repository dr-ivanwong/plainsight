# 0004 — The not-list: no WAF, GuardDuty, Security Hub, Config, CloudTrail trail, or paid monitoring

**Status:** Accepted · **Date:** 2026-07-10
**Deviates from:** the AWS security and operations baseline — a configured CloudTrail trail, GuardDuty, Security Hub, AWS Config, WAF on public endpoints, and production monitoring/RUM are standard recommendations. The [aws-cloud-engineer](../../.claude/skills/aws-cloud-engineer/SKILL.md) skill's right-sizing clause anticipates that small workloads may meet the same goals with cheaper mechanisms — this ADR is the required written record, kept as one decision because it is one coherent posture.

## Context

The threat model is inverted from a normal SaaS. The served data is public regulatory filings — free on EDGAR to anyone — so the assets actually worth protecting are **the wallet** (AWS bill, LLM token spend) and **the keys** (AWS credentials, provider API keys). At one user, each excluded service would cost more per month than the entire workload it watches.

## Decision

Exclude, deliberately: **WAF**, **GuardDuty**, **Security Hub**, **AWS Config**, a configured **CloudTrail trail** (the free 90-day event history stands), **Shield Advanced**, **KMS customer-managed keys**, **multi-region anything**, and **paid frontend monitoring** (the only user files his own bug reports).

Keep the controls that protect the wallet and keys, all ≈ $0: S3 Block Public Access, least-privilege IAM with a permission boundary, OIDC-only deployment (no long-lived credentials), API Gateway throttles set low, AWS Budgets wired to the SSM kill switch that disables extraction at threshold, cost anomaly detection, the CI-blocking invariant tests + cdk-nag, the weekly drift job, and Cognito on every surface that can spend (sync, BYOK proxy, extraction).

## Alternatives considered

- **Adopt the baseline anyway** ("best practice is best practice") — GuardDuty + Config + a trail + WAF would multiply the monthly bill several-fold to defend public data against threats whose worst case (a scraper loop, a probing bot) is already capped by throttles and the budget kill switch.
- **A subset (CloudTrail trail only)** — the strongest candidate, and the first thing to re-add; declined for now because the 90-day free event history covers a single-account project where exactly one human holds credentials.

## Consequences

The bill stays ≈ $0–4/month and there is nothing to page anyone about. The honest costs: no managed threat detection, an audit horizon of 90 days, configuration policing done by tests rather than AWS Config, and bot noise handled by throttles alone. Accepted because every residual risk lands on the wallet or the keys, and those have dedicated, funded controls.

## Revisit when

Anyone other than the owner gets AWS credentials (**a CloudTrail trail is the first re-add**); the app is shared beyond the owner (WAF and a legal/naming pass ride the same tripwire — see [plan/plainsight.md](../plan/plainsight.md) §15); any actual abuse or compromise incident occurs; or the monthly bill grows to where a watching service costs less than what it watches.

**Full argument:** [plan/plainsight-cdk.md](../plan/plainsight-cdk.md) §8 ("What's deliberately absent — the not-list").
