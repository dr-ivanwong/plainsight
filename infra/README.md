# Plainsight infrastructure

The CDK app. Build contract: [docs/plan/plainsight-cdk.md](../docs/plan/plainsight-cdk.md); recorded deviations: [docs/adr/](../docs/adr/).

Phase 0 synthesises exactly three stacks, with zero compute anywhere (no Lambda, no custom resources; the invariant tests pin this):

| Stack | Contents |
|---|---|
| `Foundation` | SNS alert topic, monthly AWS Budget (alerts at 50/80/100%), cost-anomaly detection, SSM runtime feature flags (all `false`) |
| `GithubOidc` | GitHub OIDC provider + deploy role (assume the CDK bootstrap roles only, permissions boundary attached) |
| `StaticSite` | Private versioned S3 bucket, CloudFront distribution with origin access control and the security headers (CSP pinned by test), plus the app pipeline's deploy role (sync the bucket, invalidate the cache, nothing else) |

Phase 2 stacks attach behind `config.features` (spec §1.2: a stack that is off does not exist). `Data` is built and pinned by test (single provisioned table, 20/20 plus a 5/5 watched-tickers index to stay inside the 25/25 free tier; PITR, deletion protection, and RETAIN in prod) and synthesises once `features.api` or `features.ingestion` flips. `Api` rides `features.api`: the HTTP API with structured access logs and 10 rps / 20 burst route throttles, and the read Lambdas bundled from [`apps/api`](../apps/api) source at synth (Node 22, ARM64, explicit log groups, ticker-partition-scoped reads). `Ingestion` rides `features.ingestion`: the on-demand ingest function (120 s, 512 MB, X-Ray on: the one traced path) fired asynchronously by the financials route on cold tickers, the artefacts bucket holding the search index copy, and the weekly sweep: an EventBridge rule (Sunday 19:00 UTC, Monday morning in Sydney) fires the dispatcher, which refreshes the index copy, lists watched tickers from the sparse index, and starts a Step Functions map (concurrency 2, per-item catch to an SQS dead-letter queue) that runs the ingest in sweep mode, where an unchanged newest annual filing means no work. Alarms on DLQ depth and sweep failure publish to Foundation's alert topic. Ticker search serves from the index copy in memory (bootstrapping it from the SEC on first miss) with no table access at all. Foundation gains the budget kill switch with the first spend-capable feature: a dedicated SNS topic receives the budget's kill-threshold notification and a 128 MB Lambda flips `/app/{env}/features/extraction` to `false`; arriving is the signal, nothing is parsed. `Auth` is Phase 3.

With `features.api` on, the StaticSite distribution fronts the API too (spec §3): `/v1/companies/*/financials` carries a 6-hour edge cache (keyed on the `years` and `statements` query parameters; the ingest function invalidates a ticker's path after accepted writes, finding the distribution id via the SSM parameter StaticSite publishes), and the rest of `/v1/*` passes through uncached. SPA deep-link routing is a viewer-request CloudFront Function on the site behaviour (extensionless paths serve the shell), replacing the old distribution-wide error responses, which would have rewritten API not_found envelopes into the app shell.

Synth and tests need no AWS credentials and perform no account lookups; structural tests skip Lambda bundling (`test/util.ts`) while the synth steps bundle for real, including a `--context features=all` overlay that synthesises every feature-gated stack so all handlers bundle before any prod flag flips.

**Before the first ingest runs:** create the plain SSM parameter carrying the EDGAR contact address (SEC fair-access; configuration that never lives in the repo, same pattern as the provider keys): `aws ssm put-parameter --name /app/prod/edgar/contact --type String --value you@example.com`.

Phase 2 go-live and the operational procedures (the rebuild drill, DLQ drain, quarantine review, kill-switch reset) live in [docs/runbook.md](../docs/runbook.md).

## Owner runbook: Phase 0 (spec §10)

1. Set the real account id in [`config/prod.ts`](config/prod.ts) (the `000000000000` placeholder deploys nowhere). An account id is not a secret; commit it.
2. Install and check from the repo root: `pnpm install`, then `pnpm --filter @plainsight/infra typecheck` and `pnpm --filter @plainsight/infra test`.
3. Bootstrap the one account with the modern qualifier (the default):

   ```sh
   cd infra
   npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2
   ```

4. Deploy in order: budgets live before anything can spend.

   ```sh
   npx cdk deploy GithubOidc Foundation
   npx cdk deploy StaticSite
   ```

5. Set the GitHub repository variables from the stack outputs so the workflows activate:
   - `AWS_DEPLOY_ROLE_ARN` = the `DeployRoleArn` output of `GithubOidc` (infra pipeline: deploy, drift)
   - `AWS_DIFF_ROLE_ARN` = the `DiffRoleArn` output of `GithubOidc` (the PR diff job; read-only, since a pull_request run's OIDC subject is deliberately refused by the deploy role)
   - `AWS_SITE_DEPLOY_ROLE_ARN` = the `SiteDeployRoleArn` output of `StaticSite` (app pipeline)
   - `SITE_BUCKET` = the `SiteBucketName` output, `DISTRIBUTION_ID` = the `DistributionId` output
   - optionally `SITE_ORIGIN` = `https://` plus the `DistributionDomainName` output, which turns on the post-deploy smoke check
6. The next push to main ships the built app shell to the site bucket via the app pipeline (`aws s3 sync` + an invalidation; `index.html` is never cached, hashed assets are immutable). There is no BucketDeployment construct, deliberately: it would create a custom-resource Lambda and break the zero-compute promise.
7. Subscribe an email to the `AlertTopicArn` output, then confirm the `project`/`env`/`owner` tags show up in Cost Explorer.

Remaining §10 items (`infra.yml` end to end, the stateful-stack gate, the weekly drift job) live in the repository workflows, not in this package.

## Rehearsal overlay

A throwaway same-account copy for changes that deserve rehearsal (ADR 0001). Deploy, verify, destroy the same day:

```sh
npx cdk deploy --context env=rehearsal RehearsalFoundation RehearsalStaticSite
npx cdk destroy --context env=rehearsal RehearsalFoundation RehearsalStaticSite
```

Rehearsal copies skip `GithubOidc` (one-time scaffolding) and relax data protection so teardown stays a five-minute operation. Empty the rehearsal site bucket before `cdk destroy` (`aws s3 rm --recursive`); there is no auto-delete Lambda, by design.

## Scripts

| Command | Does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` against the strict base config |
| `pnpm test` | invariant suite, cdk-nag gate, StaticSite and Data snapshots |
| `pnpm synth` | synthesises all stacks (credential-free) |
| `pnpm diff` | diff against the deployed account |

The snapshot in [`test/snapshots/`](test/snapshots/) is reviewed on change, never regenerated blindly (spec §6).
