# Architecture Decision Records

This project layers its decisions deliberately:

1. **The skills** ([`.claude/skills/`](../../.claude/skills/)) state the general engineering standards — AWS Well-Architected, Google backend practice, Meta frontend architecture, Apple design. They contain no project posture.
2. **The plans** ([`docs/plan/`](../plan/)) are the build contracts — what this project is and how it's assembled.
3. **ADRs (here)** record where this project consciously deviates from the skills' standards, and any other significant one-way decision. A deviation that isn't recorded is a gap, not a decision.

## When to write one

- You're about to do something a skill's principles advise against, and the trade-off is right for this project → record it, then do it.
- You're making a hard-to-reverse choice (a one-way door) future maintainers would otherwise relitigate.
- You're *reversing* a previous ADR → write a new one that supersedes it; never rewrite history.

Keep each ADR short — the full argument usually lives in a plan document; the ADR is the durable, findable record of the decision, its price, and its reversal trigger.

## How to add one

Copy [`template.md`](template.md) to `NNNN-kebab-case-title.md` using the next number, fill it in, and land it in the same PR as the change it justifies. Statuses: **Proposed** → **Accepted** → (possibly) **Superseded by NNNN**.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-single-account-single-environment.md) | Single AWS account, single environment — no standing staging | Accepted |
| [0002](0002-zero-vpc.md) | Zero VPC | Accepted |
| [0003](0003-ssm-securestrings-over-secrets-manager.md) | SSM SecureStrings instead of Secrets Manager | Accepted |
| [0004](0004-the-not-list.md) | The not-list: no WAF, GuardDuty, Security Hub, Config, CloudTrail trail, or paid monitoring | Accepted |
