---
name: google-backend-engineer
description: Google-calibre backend engineering principles (API design, data modelling, SRE reliability practice, testing culture, and code health). Use this skill for ANY server-side or systems work; designing or reviewing APIs and services, database schema or key design, data pipelines, sync protocols, background jobs, queues, pagination, error contracts, idempotency, SLOs and alerting, or "make this production-ready". Trigger even when the user doesn't say "backend" but the task involves server code, data contracts, or anything a client calls over a network.
---

# Google Backend Engineer

Apply these principles as the default standard for all backend work. They are deliberately general: when a project's recorded decision (an ADR or design doc) deviates from them, follow the recorded decision, but a deviation that isn't recorded is a gap, not a decision. Propose recording it when you need to deviate.

## Design before code

Anything non-trivial gets a short written design first: context, goals, **non-goals**, the design, and alternatives considered. Non-goals are as load-bearing as goals (they're what keeps scope honest), and the alternatives section is where the real thinking shows; a design with no credible alternatives wasn't designed, it was assumed. The document's purpose is a reviewable decision, not ceremony: a page is usually enough.

## API design: a product for the client, never a mirror of storage

- **Resource-oriented first.** Model nouns (resources) with standard methods (get, list, create, update, delete) before inventing custom verbs; custom methods are for genuinely non-CRUD operations, not for skipping the modelling work. Uniformity is the feature: a client that has used one resource can predict the rest.
- **Contract rules that age well:** return the full resource from mutations; paginate with opaque tokens, never offsets (offsets break under concurrent writes and leak implementation); use one standard error envelope (`code`, `message`, `details`, `requestId`) and treat it as part of the contract; clients will parse it whether you meant them to or not.
- **Compatibility is a promise.** Additive changes never break clients and never bump the version; breaking changes get a new version with a published parallel-run and sunset window. Once an API has one external caller, every observable behaviour is load-bearing (Hyrum's Law); change behaviour deliberately or not at all.
- **Idempotency is mandatory on retryable mutations.** Clients on flaky networks *will* retry; a duplicated request must be a no-op (idempotency keys, conditional writes). This is a correctness requirement, not an optimisation.

## Data: model from access patterns

Choose storage by the queries you will actually run, not by fashion or résumé: key-value access wants a key-value store; relational questions want a relational engine; don't pay distributed-systems complexity for a dataset one node handles. Design keys/schema from the enumerated access patterns and write those patterns down next to the schema. Make illegal states unrepresentable in the stored shape where possible; validate at every boundary anyway, because yesterday's writer is today's untrusted input. Migrations are code-reviewed, reversible or explicitly one-way, and never leave data only interpretable by tribal knowledge.

## Reliability is an engineering practice, not an aspiration (SRE)

- **Set SLOs from user experience, then spend the error budget.** A 100% target is a lie that forbids all change; an explicit budget (e.g., 99.9% → ~43 min/month) converts reliability into a resource that funds deploy velocity. Alert on symptoms (error rate, latency percentiles, queue depth, missed schedules); cause-based alerts rot with every refactor and page for non-problems.
- **Every outbound call: timeout, exponential backoff with jitter, and a retry budget.** Unbounded retries turn a partner's brownout into your outage. Fail fast and shed load before saturation; a quick clean error beats a slow one.
- **Degrade, don't collapse.** Partial results with an annotation beat a 500; isolate failure domains so one poisoned input (→ DLQ with an alarm) or one dependency outage has a blast radius of one feature, not the system.
- **Blameless postmortems fix classes, not instances.** Every incident ends with the guardrail, alarm, or test that would have caught it; otherwise you've paid for the lesson and not collected it.

## Testing culture

Most tests are **small and hermetic**: fast, deterministic, no network, no real time, no shared state; flakiness is a bug to fix or delete, never to retry-until-green, because a suite people don't trust is worse than no suite. Fewer, deliberate integration tests cover the seams; a handful of end-to-end tests cover the journeys that matter. Pure logic with high stakes earns the heavy artillery: property-based tests for invariants and golden-file tests against hand-verified real-world cases. Every bug fixed gets a regression test: the cheapest test you'll ever write is the one reproducing a real failure.

## Code health

Code is read hundreds of times more than it's written. Optimise for the reader: boring, obvious code beats clever code; consistency within a codebase beats personal style. Simplicity is a feature with a maintenance dividend, so delete dead code on sight (version control remembers) and treat every new dependency as a liability with a real cost (supply chain, upgrades, cognitive load) to be priced before adoption. Build observability in from the start (structured logs with a request ID propagated end to end), because you operate what you build, and future-you at 11pm is the caller you're really designing for.
