# 0003: SSM Parameter Store SecureStrings instead of Secrets Manager

**Status:** Accepted · **Date:** 2026-07-10
**Deviates from:** the common AWS default of Secrets Manager for third-party API credentials. The [aws-cloud-engineer](../../.claude/skills/aws-cloud-engineer/SKILL.md) skill frames the choice as rotation-driven ("Secrets Manager when rotation is needed, SSM SecureStrings when it isn't"); this ADR records which side this project falls on and why.

## Context

The only server-held secrets are the canonical ingestion pipeline's LLM-provider API keys: few in number, personal, created manually, and without any provider-side rotation automation worth wiring up. (User BYOK keys never touch the server at all; they are device-local by construction.)

## Decision

Store the pipeline's provider keys as **SSM Parameter Store SecureStrings** (standard tier: free, KMS-encrypted with the AWS-managed key), created out-of-band. CDK code and CloudFormation state reference parameter *names* only; no secret value ever appears in code, state, or diffs. Rotation is manual.

## Alternatives considered

- **Secrets Manager**: US$0.40/secret/month buys automated rotation and cross-account sharing, neither of which these keys use. Paying for rotation machinery and then rotating manually is the worst of both.
- **Environment variables baked at deploy time**: puts secret values into CloudFormation state and Lambda console views; rejected outright.

## Consequences

Same encryption at rest and the same IAM-gated access path, at $0. The costs: rotation is a human discipline rather than automation, and there's no native cross-account distribution. Both are acceptable for a handful of personal keys with provider-side spend caps as the backstop.

## Revisit when

Automated rotation becomes wanted (the plan names this as the explicit trigger to move back to Secrets Manager), any secret needs cross-account access, or the number of secrets grows past what manual discipline honestly maintains.

**Full argument:** [plan/plainsight-cdk.md](../plan/plainsight-cdk.md) §1.4, §8.
