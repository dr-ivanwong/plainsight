# Runbook

Operational procedures for the deployed backend (backend spec §11 schedules this document with the first Phase 2 deploy; it is the risk register's bus-factor mitigation). One calming fact frames everything here: the client needs none of it to function. A total backend outage degrades the app to its fully working offline core (the binding constraint), so no procedure on this page is ever urgent.

Written for the owner-operator. Commands assume the repository root, AWS credentials for the one account (ADR 0001), and the `ap-southeast-2` region. Angle-bracketed values come from stack outputs (`aws cloudformation describe-stacks --stack-name <stack> --query 'Stacks[0].Outputs'`).

## Phase 2 go-live (the first deploy)

The one-time sequence, which is also the first run of the rebuild drill below. The Phase 2 feature flags are already on in `infra/config/prod.ts` (flipped 2026-07-12); what is missing is the account.

1. **Set the real account id** in [infra/config/prod.ts](../infra/config/prod.ts) (the `000000000000` placeholder deploys nowhere). An account id is not a secret; commit it.
2. **Bootstrap** the account: `cd infra && npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2`.
3. **Create the EDGAR contact parameter** (SEC fair-access; configuration that never lives in the repo): `aws ssm put-parameter --name /app/prod/edgar/contact --type String --value you@example.com`.
4. **Deploy in dependency order**, budgets before anything can spend:

   ```sh
   npx cdk deploy GithubOidc Foundation
   npx cdk deploy Data
   npx cdk deploy Ingestion Api StaticSite
   ```

5. **Set the GitHub repository variables** from the outputs so the pipelines activate (details in the [infra README](../infra/README.md)): `AWS_DEPLOY_ROLE_ARN`, `AWS_SITE_DEPLOY_ROLE_ARN`, `SITE_BUCKET`, `DISTRIBUTION_ID`, and optionally `SITE_ORIGIN`.
6. **Ship the app shell**: push to main (or re-run the app workflow); from here on, infra changes ride `infra.yml` with the one-click environment gate on the stateful stacks.
7. **Subscribe an email** to the `AlertTopicArn` output; the DLQ, sweep, budget, and anomaly alarms all land there.

### The exit-criteria smoke (main plan §8, Phase 2 row)

With `ORIGIN=https://<DistributionDomainName>`:

- `curl "$ORIGIN/v1/search?q=apple"` returns results including AAPL with its exchange.
- `curl -i "$ORIGIN/v1/companies/AAPL/financials"` answers `202` with the ingesting envelope; repeating it lands on `200` with ten fiscal years. Wall clock from first request to 200 sits inside ten seconds.
- In the app: Import → AAPL → the dashboard renders the ten-year model, and a metric detail sheet's provenance names the EDGAR filing.
- Run the sweep once by hand and watch it succeed: `aws stepfunctions start-execution --state-machine-arn <SweepStateMachineArn> --input '{"tickers":["AAPL"]}'`. An unchanged ticker reports `unchanged` and does no work.

## Rebuild from zero (the drill)

Everything is IaC plus exactly two out-of-band artefacts: the CDK bootstrap and the contact parameter. From an empty account, run go-live steps 2 to 7. Canonical data needs no restore: any ticker re-ingests on demand and the weekly sweep refreshes the watched set. The owner's research lives on the owner's devices (and from Phase 3, the table's user partitions restore via point-in-time recovery). Exercise the drill on a rehearsal overlay when an infra change deserves it (`--context env=rehearsal`; see the infra README).

## Dead-letter queue drain

Signal: the sweep DLQ depth alarm. Each message carries the failing ticker and its error.

1. Read without deleting: `aws sqs receive-message --queue-url <queue url> --max-number-of-messages 10 --visibility-timeout 300`.
2. Re-run the ingest for each ticker by hand; the per-ticker lock makes repeats harmless:

   ```sh
   aws lambda invoke --function-name <IngestFunctionName> \
     --cli-binary-format raw-in-base64-out \
     --payload '{"ticker":"WES","mode":"sweep"}' /tmp/out.json && cat /tmp/out.json
   ```

3. On success, delete the message with its receipt handle. A ticker that keeps failing: read its function logs and X-Ray trace (the traced path); if the filing data itself fails the gates, the year is in quarantine (below) by design and the DLQ entry can be deleted.

## Quarantine review

Gate-failed years are held on the ticker's partition under quarantine sort keys, never served (backend spec §5). List a ticker's holdings:

```sh
aws dynamodb query --table-name <TableName> \
  --key-condition-expression 'PK = :p AND begins_with(SK, :q)' \
  --expression-attribute-values '{":p":{"S":"TICKER#WES"},":q":{"S":"QUAR#"}}'
```

Each item records the fiscal year, the failure reasons, and the rows as mapped. If the filing is genuinely inconsistent, leave it: the blast radius is that one year, and the served years name the gap. If the mapping misread the filing, fix the mapping in `apps/api` (golden tests first, bump the mapping version), re-ingest the ticker, and delete the quarantine item.

## Kill-switch reset

At the budget's kill threshold, the flipper sets `/app/prod/features/extraction` to `false`; extraction-spending paths answer with the feature-disabled envelope the client renders as its known state. After understanding the spend (Cost Explorer; the budget emails):

```sh
aws ssm put-parameter --name /app/prod/features/extraction --value true --overwrite
```

Two notes: the flag gates extraction only (Phase 2.5's spender); the read API and the sweep cannot spend meaningfully. And a CloudFormation redeploy of Foundation resets the runtime flags to their template defaults, so re-check the flag after Foundation deploys.

## Rollback

- **App**: re-run the app workflow from the previous commit; the shell redeploys in minutes.
- **Stateless stacks**: `cdk deploy` at the previous git ref.
- **Data**: structurally protected (RETAIN, deletion protection, point-in-time recovery); data-loss operations are blocked by construction.
- **Posture**: turning the feature flags off in `prod.ts` removes the Phase 2 stacks from synth entirely; that features-off posture stays under test (zero compute, the single-origin distribution) as the standing rollback target.
