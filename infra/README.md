# Plainsight infrastructure

The CDK app. Build contract: [docs/plan/plainsight-cdk.md](../docs/plan/plainsight-cdk.md); recorded deviations: [docs/adr/](../docs/adr/).

Phase 0 synthesises exactly three stacks, with zero compute anywhere (no Lambda, no custom resources; the invariant tests pin this):

| Stack | Contents |
|---|---|
| `Foundation` | SNS alert topic, monthly AWS Budget (alerts at 50/80/100%), cost-anomaly detection, SSM runtime feature flags (all `false`) |
| `GithubOidc` | GitHub OIDC provider + deploy role (assume the CDK bootstrap roles only, permissions boundary attached) |
| `StaticSite` | Private versioned S3 bucket, CloudFront distribution with origin access control and the security headers (CSP pinned by test), plus the app pipeline's deploy role (sync the bucket, invalidate the cache, nothing else) |

`Data`, `Api`, `Ingestion`, and `Auth` do not exist yet; `config.features` carries their flags (all `false`) and `bin/app.ts` documents where they attach. Synth and tests need no AWS credentials and perform no account lookups.

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
   - `AWS_DEPLOY_ROLE_ARN` = the `DeployRoleArn` output of `GithubOidc` (infra pipeline: diff, deploy, drift)
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
| `pnpm test` | invariant suite, cdk-nag gate, StaticSite snapshot |
| `pnpm synth` | synthesises all stacks (credential-free) |
| `pnpm diff` | diff against the deployed account |

The snapshot in [`test/snapshots/`](test/snapshots/) is reviewed on change, never regenerated blindly (spec §6).
