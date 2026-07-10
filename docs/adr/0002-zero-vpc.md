# 0002 — Zero VPC

**Status:** Accepted · **Date:** 2026-07-10
**Deviates from:** the classic AWS baseline of placing compute in a VPC by default. The [aws-cloud-engineer](../../.claude/skills/aws-cloud-engineer/SKILL.md) skill already advises against defaulting to a VPC; this ADR pins that stance as a standing project decision so it's a design review, not a reflex, that ever reverses it.

## Context

Nothing in this architecture requires private networking: Lambda reaches DynamoDB, S3, and SSM over AWS service endpoints with IAM; there is no RDS, no EC2, no container, no ElastiCache. A VPC here would be pure ceremony with real costs attached.

## Decision

No VPC exists anywhere in this architecture. Any future component that demands one (a relational database, private networking to a third party) triggers a design review of that component — the burden of proof sits with the thing that wants the VPC, not with the status quo.

## Alternatives considered

- **VPC "for good hygiene"** — buys a NAT Gateway (~A$50+/month of idle tax, likely exceeding the entire projected bill), subnet and routing design, ENI cold-start penalties on Lambda, and a whole class of misconfiguration — in exchange for isolating services that IAM already isolates.
- **VPC with VPC endpoints instead of NAT** — removes the NAT tax but keeps the design surface and solves a problem this workload doesn't have.

## Consequences

One entire category of infrastructure (subnets, route tables, NAT, security groups, endpoints) never exists, is never misconfigured, and never bills. The cost: adopting a VPC-bound service later means doing the network design then, under review, rather than having it pre-paid now.

## Revisit when

A component genuinely requires VPC placement — at which point the design review weighs that component's value against the full networking cost it drags in.

**Full argument:** [plan/buffet-app-cdk.md](../../plan/buffet-app-cdk.md) §1.3.
