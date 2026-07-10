---
name: aws-cloud-engineer
description: AWS cloud infrastructure engineering grounded in the Well-Architected Framework and AWS best practices. Use this skill for ANY work involving AWS; designing or reviewing architecture, writing infrastructure as code (CDK, CloudFormation, Terraform), Lambda, DynamoDB, S3, CloudFront, API Gateway, VPC/networking, IAM policies, secrets management, CI/CD pipelines to AWS, observability, cost review, or security review of cloud infrastructure. Trigger even when the user doesn't say "AWS" but the task involves deploying, provisioning, cloud cost, cloud security, or files under infra/.
---

# AWS Cloud Infrastructure Engineering

Apply these principles as the default standard for all AWS work. They are deliberately general: when a project's recorded decision (e.g., an ADR) deviates from them, follow the recorded decision and don't relitigate it, but a deviation that isn't recorded is a gap, not a decision. Propose an ADR when you need to deviate.

## The Well-Architected pillars

### Operational excellence

- **Everything is code.** Infrastructure, pipelines, alarms, dashboards, runbooks: all versioned, reviewed, and reproducible. Console changes are drift; detect them (scheduled `diff` against deployed state) and fold them back into code or revert them.
- **Small, reversible changes.** Prefer many small deployments over big-bang releases. Every change needs a rollback story you could execute under stress: redeploy previous artefact, previous IaC ref, or point-in-time restore.
- **Learn from failure.** Post-incident, fix the class of problem, not the instance: add the alarm, test, or guardrail that would have caught it.

### Security

- **Strong identity foundation.** Least-privilege IAM everywhere: scope actions and resources tightly, use conditions to narrow further, and treat `Action: '*'` or `Resource: '*'` as a defect requiring explicit justification. Prefer roles over users; humans and CI assume short-lived credentials (SSO, OIDC federation); long-lived access keys are a liability to be eliminated, not rotated.
- **Secrets never touch code.** No credentials in source, IaC state, environment-variable literals, or client bundles. Use Secrets Manager (when rotation is needed) or SSM Parameter Store SecureStrings (when it isn't), referenced by name at deploy time.
- **Defence in depth, automated.** Block public access on every S3 bucket by default; encrypt at rest (service-managed keys are fine unless compliance says otherwise) and in transit always; security headers (CSP, HSTS) at the edge. Encode security posture as CI-blocking checks (cdk-nag, policy-as-code, assertion tests) so it survives refactors; a control that lives only in a reviewer's memory doesn't exist.
- **Keep people away from data.** Prefer mechanisms (presigned URLs, parameterised access, break-glass roles with logging) over standing human access to production data.

### Reliability

- **Design for failure.** Every network call gets a timeout; every retry gets exponential backoff with jitter and a retry budget. Make mutations idempotent: clients on flaky networks will retry, and a duplicate must be a no-op.
- **Contain blast radius.** Decompose by failure domain: a poisoned message goes to a DLQ (with a depth alarm) rather than blocking the pipeline; one component's crash degrades its feature, not the system. Separate stateful from stateless resources so routine deploys can't touch data.
- **Protect state.** Backups/PITR on anything holding data users would miss, deletion protection and RETAIN policies on stateful production resources, and lifecycle rules so versioning doesn't become an unbounded leak. Test restores. An unexercised backup is a hope, not a plan.
- **Throttle at the edge.** API throttles and quotas protect both availability and the bill; load-shed before saturation.

### Performance efficiency

- **Serverless first, when the workload fits.** Spiky, low-duty-cycle, or unpredictable workloads belong on pay-per-request services (Lambda, DynamoDB, S3, SQS, Step Functions). Reach for containers or instances only when duty cycle, runtime limits, or ecosystem genuinely demand them.
- **Measure, then size.** Right-size memory/CPU from observed data, not guesses; on Lambda, remember per-millisecond billing often makes more memory both faster and cheaper. Default to ARM64/Graviton (better price-performance with rarely a downside).
- **Cache where data allows.** Edge caching (CloudFront) and TTL caches absorb read traffic cheaply; be explicit about staleness tolerance and invalidation.

### Cost optimisation

- **Cost is a design input.** Estimate the monthly line for every new resource before creating it; know which components idle (idle spend on a spiky workload signals the wrong service choice; NAT gateways, ALBs, and provisioned capacity are the classic silent leaks).
- **Attribute everything.** Consistent tags (`project`, `env`, `owner`) from day one so Cost Explorer can answer "what is this bill?".
- **Guardrails, not vigilance.** AWS Budgets with staged alerts, cost anomaly detection, and, where a component can spend meaningfully (LLM calls, data egress, per-request services exposed publicly), an automated kill switch, because a human reading an email is not an incident response.
- **Cap the quiet leaks.** Explicit log retention (the default is *forever*), lifecycle policies on buckets, cleanup of unattached volumes/old snapshots/stale environments. Exploit free tiers deliberately, and revisit provisioned-vs-on-demand as traffic patterns become known.

### Sustainability

- Maximise utilisation (scale-to-zero beats idle fleets), prefer managed services and efficient silicon (ARM), and delete what nothing uses. Mostly this pillar is free when the others are followed.

## Cross-cutting disciplines

**Infrastructure as code.** Stacks/modules are units of blast radius and deploy cadence, not service categories; keep them small enough that a diff is reviewable, because the diff *is* the review artefact. Pin environments explicitly (account/region); no environment-agnostic stacks. Express environment differences as data (typed config), not branching code. Extract shared constructs on the second use, not the first. Escape hatches to lower-level resources require a comment explaining why the abstraction couldn't express it.

**Networking.** Don't create a VPC by default: Lambda, DynamoDB, S3, and most managed services need none, and a VPC brings NAT cost, subnet design, and a class of misconfiguration with it. When a VPC is genuinely required (RDS, EC2, containers), design it deliberately: private subnets for workloads, VPC endpoints over NAT where traffic allows, security groups as the firewall.

**Deployment pipelines.** CI assumes an OIDC-federated role (zero stored cloud credentials). Separate infrastructure pipelines from application pipelines; changes to stateful resources get an approval gate. Deploys happen from the pipeline, not laptops. Smoke-check after deploy; keep rollback under five minutes.

**Observability.** Structured JSON logs with a request ID propagated end to end. Alert on symptoms (error rate, latency percentiles, DLQ depth, missed schedules), not causes; symptom alerts survive refactors and don't page for non-problems. Dashboards follow the four golden signals per endpoint. Tracing (X-Ray) where multi-hop debugging will actually happen, not everywhere.

**Right-size the controls to the workload.** The Framework itself says trade-offs depend on context: org-scale controls (multi-account Organizations + SCPs, GuardDuty, Security Hub, WAF, Config) earn their cost at org scale; a small single-account workload may legitimately meet the same goals with cheaper mechanisms: permission boundaries, invariant tests, throttles, budget kill switches. What's non-negotiable at any scale: least privilege, no long-lived credentials, encrypted data, blocked-public buckets, backups on real data, and a written record (ADR) wherever you consciously deviate from the default.
