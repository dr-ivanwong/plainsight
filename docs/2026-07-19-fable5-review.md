# Principal engineering review: the repository to date

**Date:** 2026-07-19 · **Reviewer:** Claude (Fable 5) · **Commit:** `e11a656` · **Type:** four-lens principal review

**Method.** Four reviewers, one per engineering lens in [.claude/skills/](../.claude/skills/) (Google-calibre backend, Meta-calibre frontend, Apple design, AWS cloud), each grounded in its skill, its governing plan documents, and the ADRs, plus a cross-cutting pass over gates, CI, and documentation. Every finding below was verified by reading the cited source; the highest-severity claims were independently re-verified a second time. The full gate suite ran locally at this commit, and CI history on `main` was checked. Pinned decisions (main plan §12, the ADRs, the not-list) were treated as resolved: code deviating from them is a finding; disagreeing with them is not.

**Finding codes.** This document mints X (cross-cutting), BE (backend and sync), FE (frontend architecture), UI (product and interface), and INFRA (infrastructure and cost) codes, per house-style rule 4. They belong to this document; code and commits should describe the finding in words.

**Severity ladder.** P0: the product's credibility, data, or security is broken now. P1: breaks the next scheduled step, or violates a pinned contract in a user-reachable way. P2: robustness, honesty, or maintainability debt that will bite. P3: polish and hygiene.

**Update, 2026-07-19, after owner review.** The follow-ups below have already changed what this review describes. Recorded here rather than by overwriting the findings, so the original assessment stays legible.

1. **UI-1 (the P0) is fixed.** The detail sheet now substitutes the arithmetic the engine actually performed on both denominator bases, lists the prior-year balance, states the ROIC and FCF intermediates as their dictionary notes require, and carries a guard test that evaluates every emitted equation against the engine's own result for all fourteen metrics on both bases (commits `08ba083`, `41837c3`). The finding below stands as the record of what was wrong.
2. **Single-device operation is the owner's posture; the backend stays the source of truth.** The owner runs one device and is not converging a second. Sign-in and the backend-of-record (decision §12.9) stay, so the findings on the sign-in and upload legs are untouched: **INFRA-1 and FE-2 stay P1** (sign-in still happens; both since fixed, item 3 below) and **BE-2 stays P1** (live whenever a filing is uploaded). What re-scores is the sync-*convergence* cluster, which needs a concurrent second writer to bite: **BE-1 P1 → P2, BE-3 P2 → P3, BE-4 P2 → P3, FE-4 P2 → P3**, each latent and reactivating to its original severity the day a second device syncs. **X-1 narrows** from a four-leg journey to sign-in → first sync → upload. This posture also descopes the pinned two-device Phase 3 exit criterion (main plan §8; CLAUDE.md still reads "awaiting the owner's two real devices"), which should get its own decision-log entry; the sync protocol itself stays correct-by-design and tested, so nothing here is deleted, only deferred.
3. **INFRA-1 and FE-2 are fixed.** The deployed CSP now names the Cognito hosted-UI origin, so the sign-in PKCE token exchange is no longer blocked, confirmed live on the edge (commit `b306b74`, deployed 2026-07-19). Token refresh now separates a definitive refusal from an unreachable endpoint: only a refusal signs the device out, while a network blip, a 5xx, or a 429 keeps the session and fails the run into the scheduler's backoff, so the retry-until-accepted obligation holds through a bad network moment (commit `d1af36e`). With both landed, the imminent single-device path (sign-in → first sync → upload) has one live blocker left, BE-2 on the upload leg (since fixed, item 4); the CSP fix has cleared the runbook's account-creation step.
4. **BE-2 is fixed.** The upload worker's `validating` stage now runs the pinned §5 gates (cross-footing, scale-jump, and the conversion-level sign and integer checks) over the extracted result, so a filing that does not cross-foot no longer reaches review unflagged (commit `4288746`). Uploads keep no quarantine, since the user is the reviewer: findings never fail the job and no year is dropped, they ride the review payload as `gateFindings` for the reviewer to see. With this, every named code break on the single-device path (INFRA-1, FE-2, BE-2) is cleared; what remains for go-live is the rehearsal itself (an owner step) and the never-fired cost chain (INFRA-3).
5. **FE-1 is fixed.** A per-feature-region error boundary now carries the pinned three affordances (a friendly message naming the region, a retry that remounts it clean, and the export escape hatch, downloading the real library file through a shared path the data screen uses too); it wraps every sheet body, the three Recharts surfaces, review mode, and the import-job strip, and the router gained `defaultErrorComponent` as the screen-level backstop (commit `d51f4cd`). The pinned scenario, a chart crash taking down a grid holding unsaved keystrokes, is now impossible by construction; eight tests drive real crashes through catch, retry, and the export path.
6. **FE-3 is fixed.** The service worker now registers as `'prompt'` with no `skipWaiting`, so a deploy installs the new worker beside the running session and it takes over on the next launch, never by reloading mid-entry (commit `2d100f1`). `clientsClaim` stays true so the first install still controls the open page for the airplane-mode journey. The options live in a data module with two tests pinning the three load-bearing choices.
7. **INFRA-2 is fixed.** The PR diff job now rides a dedicated read-only role rather than the deploy role, which a `pull_request` run's OIDC subject was always going to be refused by (deploys stay main-only, by design). The new role trusts exactly the `pull_request` subject as a full-string match, and its entire reach, pinned by an inline grant and a matching permissions boundary, is assuming the CDK lookup role, so a PR can read the deployed state and change nothing; the diff runs template-only (`--no-change-set`), since changeset analysis would need the deploy-side permissions the role deliberately lacks (commit `97d407b`). The OIDC invariant block was reworked from one role to a closed set of two, and the cdk spec §7 and the arming step in the infra README moved in the same commit. One owner step remains to activate it: set the new `AWS_DIFF_ROLE_ARN` repository variable from the stack's `DiffRoleArn` output. The `environment:*` widening the same trust carries is INFRA-4, untouched here.
8. **INFRA-3's code half is fixed, and the "likely" is now confirmed.** The finding marked the tag-key question as unverifiable from documentation alone; the primary sources settle it. The two services genuinely disagree: Budgets requires the `user:` prefix on user-defined tag keys (its filter documentation), so the budget's `user:project` was correct, but Cost Explorer expressions take the bare key (every tag-monitor example in the CreateAnomalyMonitor API reference carries no prefix), so the monitor's `user:project` matched a key that exists on nothing and watched no spend, silently, forever. The monitor now filters on bare `project`; both filters carry comments, and both test pins carry cross-references, stating the asymmetry is each service's documented form so neither is unified to the other (commit `36e4a4f`). The finding's two directed procedures landed in the runbook: a post-activation verification that proves each key form against real spend (a wrong key fails silent), and a deliberate kill-chain drill (one hand-published SNS message drives flipper, flag, decline, and relay email, since delivery is the signal). Both remain owner steps, now written down as runbook steps 9 and 10. Note the monitor is create-only on its specification, so the deploy replaces it and the new one re-baselines over ~10 days; the first such deploy failed on a name collision (the required monitor name cannot be reused during create-before-delete), fixed by deriving the name from a digest of the spec so every replacement gets a fresh name (commit `c873dce`).
9. **INFRA-4 is fixed.** The deploy role no longer trusts `environment:*`, the subject the retired approval gate added; environments auto-create unprotected on first use, so it let any workflow on any ref assume the deploy role. With only the main-push subject left, the trust folds to an exact `StringEquals`, and the invariant test now asserts it by full-document equality so the wildcard cannot return (commit `a6126ab`). The change is an in-place role update on the untouched main-push subject, so the deploy applying it cannot lock the pipeline out.
10. **BE-5 is fixed.** The extraction quota now counts spend, not tries. A unit is still consumed at job creation, where the 429 answer lives, but it returns whenever the attempt dies before any provider is called: the worker not starting, the kill switch flipping between request and worker, an expired or unreadable upload, a preprocess refusal, or a fully keyless ladder (the deployed no-keys state, where ten tries would otherwise exhaust the month). The refund is a conditional decrement floored at zero, keyed to the month the creation was billed to, so it can never mint headroom or refund the wrong month; once a provider has run, the unit stays consumed whatever the outcome (commit `9f68456`). Backend spec §6 gained the dated amendment and the runbook gained a quota-reset section for the pathological remainder. Deployed to the Api and Ingestion Lambdas via a manual pipeline dispatch (commit `4978f50` added `workflow_dispatch` as the on-demand deploy lever for bundled-handler changes that touch no infra path).
11. **FE-5 is fixed.** The review model no longer mints the not-reported-zero state from the extraction's `notPrinted` claim. The claim now stays absent-with-a-hint: the field is empty, blocks completeness like any missing figure, computes and gates and writes nothing, and surfaces as a quiet cell note plus one banner line pointing at the field's own menu. Only the user asserts the state, through that menu (the same S5 affordance), and an asserted zero saves as the reviewer's own figure with no per-field extraction provenance, so the provenance trail names who minted it (commit `58be7b5`). This makes the code match the already-pinned data-model §8, so no spec moved. Four tests cover the seed, the writes, and the full assert-through-the-menu journey.
12. **FE-6 is fixed.** The review save is now all-or-nothing: a new `upsertStatements` wraps the per-statement loop in one Dexie read-write transaction, so a failure at any write rolls back every earlier one, `dataVersion` bumps included, and the failure banner's "Nothing was stored" is true by construction (commit `d289b98`). The existing single-write entry-screen path is untouched. This makes the code match copy that was already pinned, so no spec moved. A db-layer test proves the batch is atomic, and a component test drives a mid-save failure through the real router and Dexie to an empty library and an unbumped company version.
13. **BE-6 is resolved.** The four spec-versus-code deltas are amended to the truth, docs-only, no behaviour changed (commit `ae42567`). Three were wording debts recorded as dated staging: the size ceiling is a head re-check before any job exists, not a presigned-PUT condition S3 cannot bind; uploads are PDF-first with the XLSX/CSV SheetJS stage still pinned as roadmap; the proxy buffers because an HTTP API Lambda integration cannot stream, and statement-level chunking is the control that fits the ceiling. The fourth, the keep-source toggle, is removed from the design by owner decision rather than deferred: review-time source peek plus the owner's own re-downloadable filing serve source-checking at one seat, so a durable server copy was priced and declined. The main plan's sibling upload bullet moved in step.
14. **UI-2 is fixed.** First-run pane 2 and the signed-out settings note no longer state the local-first architecture the source-of-truth decision retired. Both now tell the catch-up truth (a working copy on the device, the durable copy behind sign-in, export as portability), the frontend spec's S1 and S9 copy moved in the same change (completing the §12.9 documentation pass and resolving plan tension 5), and a copy-contract test pins the new claims and the absence of the superseded ones, so the strings cannot outlive the architecture again (commit `6989e57`; forward risk 5's guard). Verified live in the browser on a fresh profile.
15. **UI-3 is fixed, and plan tension 6 dissolved.** Both pinned storage-pressure states are built. The entry screen now carries a proactive quota-low banner at a four-fifths usage threshold (main plan §14's "before writes begin failing"): non-blocking, an export link, never a modal. A 30-day export nudge, off a pure `exportOverdue` boundary, shows on the data screen and the settings root, both gated on a non-empty library so a fresh install is never nagged (commit `f83e4a1`). The tension I flagged, whether §12.9 demoted these states, turned out already settled: §14 was amended for §12.9 and deliberately kept both mitigations (re-download is friction, unsynced edits are real), so no spec decision moved. Verified live in the browser; the pressure path is pinned by mocked-estimate tests since a real quota cannot be filled in a browser.
16. **X-2 is fixed, and plan tension 4 is settled.** One documentation commit sweeps every drift instance the finding named into agreement with the 2026-07-18 decisions (commit `ac9bea7`): the README front door, the runbook framing and its gate and next-slices references, the main plan §7 gate line and its epigraph (annotated, not overwritten), the cdk §7 rollback contradiction, CLAUDE.md (both gate mentions, the Zustand pin replaced with the built `useSyncExternalStore` shape, the BYOK proxy annotated server-half/client-pending for FE-9's claim), the db.ts header, and the infra README capacity (the real 15/15 + 5/5 + 5/5). ADR 0001 gains a dated amendment recording the gate's retirement and what carries the load, which settles plan tension 4: no human checkpoint exists on stateful deploys, deliberately, and the document now says so. The amendment also records plainly that `main` carries no branch protection, so the effective control is that only the owner can push, the single-user posture priced with eyes open. The instances already fixed earlier this session (session.ts with FE-2, the spec S1/S9 copy with UI-2, the ETF draft number note) were verified in place. A note added to CLAUDE.md makes its current-state paragraph part of the definition of done for any future decision pass, so this drift is less likely to recur.
17. **FE-8's size budget is now enforced (lint half still open).** A hand-rolled, dependency-free check (`scripts/check-bundle.mjs`, the contrast-and-style-gate house pattern) gzips the built entry module and its modulepreload graph and fails CI over the pinned 180 KB ceiling; it runs after Build in ci.yml, and main plan §5 records both the mechanism and that Lighthouse CI and the TTI budget stay unenforced (commit `5052970`). The measurement corrected a review error worth noting: the true initial graph is 172.1 KB, not the 78 KB the entry chunk alone suggested (the route definitions statically reach the Dexie layer and the Zod schemas, all modulepreloaded), so the gate is load-bearing from its first run with 7.9 KB of headroom, not a formality. FE-8 stays open for its lint half: no eslint stage exists, and the deliberate install-or-record decision is still owed. This does not change the open counts.

---

## 1. Verdict

Plainsight is an unusually disciplined codebase, and most of what its documents claim about quality is true in source. The calc engine's 100% branch coverage is genuinely enforced and its golden corpus is real hand-verified data held to integer equality. The infrastructure invariant suite has teeth most teams never grow: an exact pinned route table, closed-set IAM wildcard scans, the CSP asserted by full-string equality. Zod guards every boundary in both directions, including handlers validating their own responses. The no-NaN discipline survives from engine to pixel. The BYOK proxy's key hygiene is textbook. The design tokens are typed, complete, and CI-enforced with a from-scratch WCAG contrast gate. This is a repo whose stated standards are load-bearing, which is rare.

Three things cut against that baseline.

**First, one P0 (now fixed).** The metric detail sheet substituted the wrong inputs into its formula whenever the engine used an averaged denominator (UI-1). For every multi-year company, including all five ASX samples, the ROE and ROIC sheets printed an equation that did not equal the displayed value, and the prior-year balance the computation actually used appeared nowhere on the sheet. The product's own success criterion (main plan §13) defines exactly this, a displayed number the owner cannot reproduce by hand from its sheet, as a P0 regardless of size. It survived a green 100%-coverage suite because the test fixtures for the substituted formula stopped at one year. *Fixed 2026-07-19 (commits `08ba083`, `41837c3`); see the update note above.*

**Second, the unrehearsed path.** After the single-device re-score (update note above), the imminent walk is the runbook's next steps minus the second device: create the Cognito account, sign in, first sync, upload a filing. The P1s still cluster there. In order: the deployed CSP blocks the sign-in token exchange outright (INFRA-1); a network blip during token refresh silently signs the device out and stops the write-retry obligation (FE-2); and the upload pipeline reports a validation stage it does not perform (BE-2). The three sync-convergence races (BE-1, BE-3, BE-4) and the wire-parse wedge (FE-4) are real but now latent, waiting on a second device this posture does not add. The pattern is unchanged: every box is verified hermetically and excellently, and every break lives at a seam between boxes (deployed config versus shipped client, OIDC trust versus workflow trigger, a cost-alert chain that has never once fired end to end). The repo verifies units; nothing yet rehearses the journey. *(Update: INFRA-1, FE-2 and BE-2 all fixed 2026-07-19, commits `b306b74`, `d1af36e` and `4288746`; every named code break on the single-device path is cleared, leaving the rehearsal itself and the never-fired cost chain.)*

**Third, contract maintenance.** The repo's method is documents-as-contracts, and the two same-day decision passes of 2026-07-18 (the source-of-truth migration, then the gate retirement) each left an incomplete wake. The README still describes a three-phases-old, superseded architecture; the first-run screen tells the user "no account and no server" one day after the backend became the source of truth; CLAUDE.md, the main plan, the cdk spec, the runbook, and ADR 0001 currently disagree about whether a stateful approval gate exists (X-2). Separately, several pinned capabilities shipped quietly narrower than their specs (BE-6, FE-8, FE-9, UI-3) with no amendment recording the staging.

None of this is rot, and none of it is negligence; it is the specific residue of building fast against strong specs with hermetic tests. The recommended sequence in §11 is ordered so that the next runbook steps stop being the place the latent defects live. The CSP fix has since landed (INFRA-1, 2026-07-19), so the Cognito account can now be created and sign-in works; the sync-convergence fixes are no longer go-live blockers under single-device operation, but they remain the pre-condition for ever adding a second device.

---

## 2. What is genuinely strong

Evidence-backed, not aspirational:

- **The engine earns the trust story.** 333 tests, 100% statements/branches/functions/lines enforced as a threshold (295/295 branches), a total formatter with pinned degenerate phrases, typed not-meaningful reasons throughout, and a ten-company golden corpus including five hand-transcribed ASX reports (`packages/calc-engine`).
- **The golden-corpus claim survives inspection.** Mapping the recorded EDGAR documents must reproduce hand-verified fixtures to integer equality, with key-set equality so no fabricated items pass (`apps/api/test/mapping.golden.test.ts:55-83`); the mapping is versioned and carries a per-item concepts-and-accession audit trail.
- **Auth is structural, not habitual.** The invariant suite pins the exact sorted route table and asserts JWT auth on precisely the flagged routes and none elsewhere, so a new route forces an explicit decision (`infra/test/invariants.test.ts:695-729`); every authenticated handler still re-checks the JWT subject claim (`apps/api/src/handlers/syncPush.ts:21-24`).
- **BYOK key hygiene is done right.** Destination resolved only from the registry, a forwarded-header allowlist that excludes the key and Authorization, error logging by error name only, and a spec-mandated redaction test spying every log path (`apps/api/src/handlers/byokProxy.ts`, `apps/api/test/byokProxy.test.ts:172-174`).
- **The sync client's comparison logic is right and tested.** The full (lamport, deviceId) pair comparison including the pre-tiebreak shadow migration; two-device convergence, tombstone-beats-dirty-edit, and both tiebreak directions individually tested (`apps/web/src/sync/engine.ts:109-112`, `apps/web/src/sync/engine.test.ts:96-276`). The state-diff pending design makes lost-response replays arrive as harmless pull echoes.
- **Boundary validation is everywhere, in both directions.** Zod on Dexie reads with atomic quarantine (`apps/web/src/db/safeRead.ts:85-105`), storage invariants in the schema itself, API responses parsed before use, and sync handlers self-checking their own response bodies against the wire schema before serving.
- **The no-NaN rule holds from engine to pixel.** One total formatter behind one union renderer (`apps/web/src/components/StatusValue.tsx`), short degenerate forms with full spoken phrases, and a sparkline that draws a centre line rather than divide by zero.
- **Token discipline with mechanical enforcement.** The full pinned type and spacing scales as typed tokens, a from-scratch WCAG contrast test pinning per-pair floors in both themes (`apps/web/src/styles/contrast.test.ts:88-144`), and the 2026-07-19 instrument-panel decisions (health direction, rule-to-card map, multi-year rows, key stats) shipped exactly as pinned and test-held to the dictionary.
- **External-client etiquette is implemented, not promised.** EDGAR user agent with SSM-sourced contact, pacing, conditional GETs, jittered backoff with a retry budget; ASX MAP hard-paced at 1 rps with PDF magic-byte checks, a 60 MB cap, and an extract-once cache that caches quarantines too (`apps/api/src/edgar/client.ts`, `apps/api/src/asx/client.ts`).
- **IAM goes beyond the spec's ask.** Hand-built execution roles whose only baseline grant is their own log group, partition-key-prefix conditions per principal, no DeleteItem or Scan anywhere (asserted by test), and blast-radius-separated pipeline roles under a permissions boundary (`infra/lib/constructs/app-function.ts:62-66`, `infra/lib/stacks/github-oidc.ts:64-90`).
- **Cost discipline is code.** The free-tier capacity carve-out pinned by test, staged budget alerts with a dedicated kill topic and flipper, 30-day retention on every log group, lifecycle rules on all three buckets (`infra/lib/stacks/foundation.ts:91-206`).
- **Process honesty.** The app workflow records its own incident ("on 2026-07-18 two commits with a failing journey shipped because only the unit gate held the door") and now gates deploys on both suites; the three direction drafts (hedge-fund gap, ETF shelf, finance-look staging) are correctly quarantined outside the authority set with explicit decision-impact registers.
- **Bundle discipline in practice.** A 78 KB gzipped shell against the 180 KB budget, with Recharts, pdf.js, and the extraction runner all lazy behind user actions, and the model adapters verifiably unreachable from the serving path (`apps/web/src/features/entry/EntryScreen.tsx:147-167`).

---

## 3. Findings at a glance

41 findings. After the 2026-07-19 pass (update note at the top): UI-1, INFRA-1, FE-2, BE-2, FE-1, FE-3, INFRA-2, INFRA-3, INFRA-4, BE-5, FE-5, FE-6, BE-6, UI-2, UI-3 and X-2 fixed, and four sync-convergence findings deferred under single-device operation. Open: 0 P0, 1 P1, 9 P2, 15 P3.

| Code | Sev | Finding |
|---|---|---|
| UI-1 | P0 (fixed) | Detail sheet substitutes wrong inputs for averaged-denominator metrics; equation shown does not equal the value. Fixed 2026-07-19 (`08ba083`, `41837c3`) |
| X-1 | P1 | The sign-in → first-sync → upload path is unrehearsed; its named code breaks (INFRA-1, FE-2, BE-2) all fixed 2026-07-19, so what remains is the rehearsal (owner step) and the cost chain (INFRA-3); second-device leg descoped |
| BE-1 | P2 (was P1) | Sync pull checkpoint can permanently skip committed records (non-atomic seq, eventually consistent feed); needs a concurrent second writer |
| BE-2 | P1 (fixed) | Upload job's "validating" stage never runs the pinned cross-footing gates. Fixed 2026-07-19 (`4288746`) |
| FE-1 | P1 (fixed) | No error boundaries anywhere; the pinned message/retry/export escape hatch does not exist. Fixed 2026-07-19 (`d51f4cd`) |
| FE-2 | P1 (fixed) | Transient network failure during token refresh signs the device out and halts write retries silently. Fixed 2026-07-19 (`d1af36e`) |
| FE-3 | P1 (fixed) | Service worker force-reloads mid-session on every deploy, against its own stated intent; unsaved work at risk. Fixed 2026-07-20 (`2d100f1`) |
| UI-2 | P1 (fixed) | First-run copy states the superseded architecture ("no account and no server") as fact. Fixed 2026-07-20 (`6989e57`) |
| UI-3 | P1 (fixed) | Pinned storage-pressure states (quota banner, 30-day export nudge) are unbuilt; first symptom is a failed save. Fixed 2026-07-20 (`f83e4a1`) |
| INFRA-1 | P1 (fixed) | Deployed CSP (`connect-src 'self'`) blocks the shipped sign-in token exchange; invariant test certifies the breaking value. Fixed 2026-07-19 (`b306b74`), verified live on the edge |
| INFRA-2 | P1 (fixed) | PR-triggered diff job cannot assume the deploy role (OIDC subject mismatch); "the diff is the review" never runs. Fixed 2026-07-20 (`97d407b`) |
| INFRA-3 | P1 (fixed) | Cost-anomaly monitor likely filters on a non-existent tag key; the whole kill-switch chain has never fired and fails silent. Confirmed against AWS docs and fixed 2026-07-20 (`36e4a4f`); chain-firing now a runbook drill |
| X-2 | P2 (fixed) | Documentation drift cluster from the two 2026-07-18 decision passes (README, runbook, main plan, cdk spec, CLAUDE.md, ADR 0001, code comments). Fixed 2026-07-20 (`ac9bea7`); plan tension 4 settled in the same pass |
| BE-3 | P3 (was P2) | Watermark advance can clobber concurrently appended tombstone marks (lost purge signal); needs a concurrent second writer |
| BE-4 | P3 (was P2) | Client full resync never reconciles server-absent records; the purge that creates the ghost needs a second device |
| BE-5 | P2 (fixed) | Extraction quota (10/month) is consumed by attempts that cannot succeed and never refunded; no reset procedure. Fixed 2026-07-20 (`9f68456`) |
| BE-6 | P2 (fixed) | Pinned upload/proxy capabilities shipped narrower than spec, unamended (keep-source, streaming, PDF-only, presigned size claim). Fixed 2026-07-20 (`ae42567`); keep-source removed by owner decision, the rest recorded as staging |
| FE-4 | P3 (was P2) | One unparseable pulled record wedges sync permanently; the cross-version record needs a second device (cheap to fix regardless) |
| FE-5 | P2 (fixed) | Extraction review seeds "not reported, treat as zero" from the model's claim; the data model reserves that assertion for the user. Fixed 2026-07-20 (`58be7b5`) |
| FE-6 | P2 (fixed) | Review-mode save is non-atomic while its failure banner says "Nothing was stored". Fixed 2026-07-20 (`d289b98`) |
| FE-7 | P2 | Entry commits read-modify-write from render state; rapid commits can drop an earlier field |
| FE-8 | P2 (size half fixed) | Two pinned CI stages do not exist (lint; Lighthouse/size-limit budgets), with a vestigial eslint-disable in source. Size budget enforced 2026-07-22 (`5052970`); lint stage still owed |
| FE-9 | P2 | Proxy-mode extraction has no client path despite the pinned hook contract and the Phase 3 completeness claim |
| UI-4 | P2 | Last-synced renders as a bare locale wall-clock time, off the house date pattern |
| UI-5 | P2 | Px-only type tokens ignore browser text-size preferences despite the pinned dynamic-type test point |
| UI-6 | P2 | Degenerate values hang accessibility on `aria-label` over generic spans; a deep-linked companion misstates its reason |
| INFRA-4 | P2 (fixed) | Dead `environment:*` OIDC trust subject survives the retired gate; any workflow environment on any ref can assume the deploy role. Fixed 2026-07-20 (`a6126ab`) |
| INFRA-5 | P2 | Canonical ASX extraction spend is reachable unauthenticated once keys land; cdk spec §8's Cognito sentence is half-true |
| INFRA-6 | P2 | CloudFront invalidation grant is account-wide, justified by a pre-amendment single-tenant claim |
| X-3 | P3 | Infra test suite has no timeout budget; three synth-heavy tests flake on a cold cache at the 5-second default |
| BE-7 | P3 | Idempotency records globally keyed and unconditionally overwritten; user scoping only on read |
| BE-8 | P3 | LWW tiebreak can order exotic deviceIds differently in JS and DynamoDB; constrain the charset |
| BE-9 | P3 | One schema-failing year aborts a whole ingest instead of quarantining; a stale DOC# cache row can wedge a ticker |
| FE-10 | P3 | Dexie v2 migration landed without the pinned previous-version upgrade-fixture test |
| FE-11 | P3 | Settings sign-in affordance reads `navigator.onLine` non-reactively |
| UI-7 | P3 | Table section bands use `scope="colgroup"` where `rowgroup` is correct |
| UI-8 | P3 | Motion deviations unrecorded: pinned card stagger unimplemented; first-run reduced-motion replays translate keyframes |
| UI-9 | P3 | Light mode's segmented control has no visible selection pill (both surfaces are white) |
| UI-10 | P3 | Token strays: freestyle letter-spacing, tracking at an unpinned size, hard-coded switch geometry and min-widths |
| INFRA-7 | P3 | Invariant sweep gaps: log retention asserted only for the Api stack's functions; Cognito token lifetimes unpinned |
| INFRA-8 | P3 | `localhost:5173` baked into prod Cognito callbacks and uploads CORS, unrecorded |

---

## 4. Cross-cutting

### X-1 · P1 · The go-live path is unrehearsed (single-device scope)

*Re-scored 2026-07-19: the owner runs one device (update note at the top), so the second-device convergence leg is descoped and its findings (BE-1, BE-3, BE-4, FE-4) are deferred as latent. What remains on the imminent path is below.*

Phase 3 is code-complete and the runbook's next steps are: create the owner account, sign in, first sync, upload a filing. In order along that path: INFRA-1 blocks sign-in at the first fetch; FE-2 can silently sign the device back out on a network blip; BE-2 reports a validation stage the upload worker does not perform, and BE-5 spends a quota unit on failed attempts. Each break lives at a seam no hermetic suite covers: deployed CSP versus shipped client, OIDC trust versus workflow trigger, a budget-to-kill-switch chain that has never fired. The single writer removes the concurrency races from this walk, but not the seams between deployed config, client, and the untested cost chain. *(Update 2026-07-20: INFRA-1, FE-2, BE-2 and BE-5 all fixed, commits `b306b74`, `d1af36e`, `4288746` and `9f68456`; every named code break on this path is cleared, leaving the rehearsal itself and the cost-chain firing, both owner steps.)*

**Direction:** treat go-live as a rehearsed journey, not a checklist. After INFRA-1 (landed 2026-07-19): one scripted walk of sign-in → first sync → upload against the real backend; token-refresh tolerance (FE-2, also landed) so a bad network moment cannot sign the device out mid-drain; one deliberate firing of the budget kill chain. If a second device is ever added, the deferred convergence work (below) becomes the pre-condition, with a DynamoDB Local pass covering push/pull/tombstone/resync.

### X-2 · P2 (fixed) · The 2026-07-18 decision passes left the contracts disagreeing

*Fixed 2026-07-20 (`ac9bea7`): one documentation commit swept every instance below into agreement, the epigraph and main-plan gate line annotated rather than overwritten so the history stays legible. ADR 0001's dated amendment records the gate's retirement and settles plan tension 4 (no human checkpoint, deliberately) and the no-branch-protection fact. The three instances fixed earlier this session (session.ts with FE-2, S1/S9 copy with UI-2, the ETF number note) were verified in place, and CLAUDE.md's current-state paragraph is now part of the definition of done for future decision passes. The original finding follows.*

The source-of-truth migration (main plan §12.9) and the same-day gate retirement each amended some documents and missed others. Verified instances:

- **README.md** (public front door): status is three phases stale ("Phase 0 is built... Phase 1 is next"); the core-constraint paragraph still promises "everything works offline... If every server on earth is down"; "local-first" and "five real companies" both superseded.
- **Runbook**: the framing paragraph still says a total backend outage costs nothing and "no procedure on this page is ever urgent", the exact posture §12.9 reversed; step 6 still routes infra changes through "the one-click environment gate" that step 1 of the Phase 3 section says is gone; "the client wiring and the sync routes are the next slices" predates their landing.
- **Main plan**: §7 still describes the stateful environment gate; the closing epigraph still states the zero-dependency promise §12.9 superseded, unannotated.
- **cdk spec §7**: internally inconsistent; the amendment note at one line, "behind the approval gate" three lines later.
- **CLAUDE.md**: describes the gate as standing, twice; pins "Zustand (UI)" though zustand appears nowhere (UI state is component state plus two hand-rolled `useSyncExternalStore` stores, arguably better, unrecorded); declares the BYOK proxy landed while the client half is absent (FE-9).
- **ADR 0001**: still lists the environment gate as a standing compensating control; the repo's own rule says a reversal needs a superseding record.
- **Load-bearing code comments**: `apps/web/src/db/db.ts:3` ("IndexedDB is the source of truth, not a cache") and `apps/web/src/auth/session.ts:2` ("sync is an optional overlay").
- **infra/README.md**: capacity described as "20/20 plus a 5/5 index"; the table is 15/15 + 5/5 + 5/5 since the sync index landed. The ETF draft's adoption note also cites "the next free number is 12" though entries 12–14 were minted the same day.

**Direction:** one documentation commit sweeping all of the above, plus an ADR 0001 amendment (or ADR 0005) recording the gate's retirement and what carries the load. The user-facing instance is UI-2. Consider adding CLAUDE.md's current-state paragraph to the definition of done for any future decision pass.

### X-3 · P3 · The infra suite has no timeout budget

At this commit, a cold-cache `pnpm -r test` fails: the two snapshot tests and the all-stacks cdk-nag test each exceed Vitest's default 5-second timeout (they synthesise the full app and bundle handlers; 6–9 seconds observed cold, all 75 tests green warm). `infra/vitest.config.ts` sets no `testTimeout`. CI is currently green because runners squeak under, but `pnpm -r test` gates every web deploy via ci.yml, so the margin is noise-thin. **Direction:** an explicit generous `testTimeout` (synth deserves 120 s) in the infra Vitest config.

---

## 5. Backend and sync

### BE-1 · P2 (re-scored from P1) · Pull can permanently skip committed records

*Single-device re-score (2026-07-19): every loss path here needs a concurrent second writer (inverted commit order) or a cross-device skip. With one writer the device already holds its own writes locally, so this cannot lose data single-device. It stays worth fixing before any second device, and it remains a standing deviation from the spec's transact-write wording (backend spec §4); reactivates to P1 the day a second device syncs.*

`runPush` assigns `seq` via a separate unconditional counter update, then commits with a conditional put (`apps/api/src/sync/core.ts:53-57`, `apps/api/src/db/syncStore.ts:130-173`); commit order can invert seq order. Independently, pull reads an eventually consistent GSI with no cross-item ordering guarantee and advances the checkpoint to the last seq returned. Either way a pull can observe seq N+1 without N and checkpoint past it; because burnt seqs are legal ("monotonicity, not density"), a gap is indistinguishable from a hole and the skipped record is never served again. The LWW winner then exists on the server while the other device never receives it: permanent divergence with both devices showing zero pending, in exactly the window backend spec §4 exists to serve. The fake-store tests are single-threaded and strongly consistent, so they cannot exhibit it. **Direction:** honour the spec's wording: assign seq atomically with the accept (TransactWriteItems: condition-checked counter increment plus the conditional put), making seqs contiguous so gaps are pure feed lag; then have pull either refuse to advance past a gap or re-serve an overlap window (the client already treats echoes as no-ops).

### BE-2 · P1 (fixed) · The upload job's "validating" stage does not validate

*Fixed 2026-07-19 (`4288746`): the stage now converts the extracted result through the source-agnostic minor-unit converter and runs `runGates` over it. Uploads keep no quarantine (the user is the reviewer), so findings never fail the job and no year is dropped; they ride the review payload as an additive-optional `gateFindings`, and backend spec §6 was amended in the same commit. The original finding follows.*

The stage patched as `validating` performs only Zod shape parses; `runGates` (cross-footing, scale-jump) is imported by the EDGAR and ASX paths but never by the upload path (`apps/api/src/ingest/uploadJob.ts:89-94` versus `ingest/core.ts:70` and `ingest/asxCore.ts:149`). Backend spec §6 pins "the same gates as §5" for this stage, and the job's honest-stage-labels contract is broken by a stage that reports work it did not do; a filing whose balance sheet does not cross-foot reaches review unflagged by the server. The client's review grid does run identity gates and nothing saves unconfirmed, so user harm is bounded; the spec violation stands. **Direction:** run the gates over the converted figures in the worker and surface failures on the job, or amend the spec if client-side gating is the deliberate design.

### BE-3 · P3 (re-scored from P2) · Watermark advance can clobber tombstone marks

*Single-device re-score (2026-07-19): the race is a concurrent push landing during a pull; one device runs one sync at a time, so it cannot occur without a second device. Latent; reactivates to P2 the day a second device syncs.*

`runPull` reads the marks list, filters expired, then SETs `tombstoneMarks` wholesale from that stale read, while a concurrent push appends marks via `list_append` (`apps/api/src/sync/core.ts:99-108`, `apps/api/src/db/syncStore.ts:202-243`). A delete pushed during a pull loses its mark; its eventual TTL purge then never advances the purge watermark, so a long-offline device is never told to full-resync for it and resurrects the deleted record silently. **Direction:** optimistic concurrency on the SEQ item (version attribute, retry) or store marks as individual items so append and prune never contend.

### BE-4 · P3 (re-scored from P2) · Full resync never reconciles absence

*Single-device re-score (2026-07-19): the purged-elsewhere record that becomes a ghost requires another device to have deleted it; single-device, the deleter is the same device that already dropped the row. Latent; reactivates to P2 the day a second device syncs.*

On `full_resync_required` the engine resets the checkpoint and re-pulls, but never notes which records the full feed contained (`apps/web/src/sync/engine.ts:143-147`). A record deleted and purged server-side (the exact case the watermark signal exists for) survives locally forever: clean, never pending, no tombstone ever coming. Backend spec §4 says the client re-pulls everything and reconciles by LWW; absence is part of what needs reconciling. **Direction:** during a resync run, collect seen record keys; afterwards delete clean local rows absent from the feed (dirty rows correctly re-push).

### BE-5 · P2 (fixed) · The quota burns on failures and never refunds

*Fixed 2026-07-20 (`9f68456`): both directions were taken. A `refundQuota` (conditional decrement floored at zero, so it can only undo a recorded consume) returns the unit on every spendless failure: worker no-start, kill switch flipped between request and worker, expired or unreadable upload, preprocess refusal, and the keyless ladder; once a provider has run, the unit stays consumed. The refund is keyed to the month the creation was billed to, so a month-boundary straddle refunds the right month. Backend spec §6 carries the dated amendment and the runbook gained the quota-reset section. The original finding follows.*

`tryConsumeQuota` runs before job creation and worker fire; a worker-fire throw, an expired upload, a preprocess refusal, or a fully skipped ladder (every rung `no_credential`) each consume a unit of the 10-per-month quota with zero extraction performed (`apps/api/src/handlers/createExtraction.ts:158-199`, `apps/api/src/ingest/uploadJob.ts:59-94`). In the currently deployed state (no provider keys yet), ten attempts would exhaust the month. The runbook has no quota-reset procedure. **Direction:** refund on infrastructure-shaped failures (conditional decrement) or consume at the first provider call; add a reset note to the runbook.

### BE-6 · P2 (fixed) · Pinned capabilities shipped narrower than spec, unamended

*Fixed 2026-07-20 (`ae42567`): all four deltas amended in backend spec §6-§7 and the main plan's sibling bullet, docs-only. The presigned-size claim now names the head re-check as the real gate; the format staging is recorded as PDF-first with the SheetJS stage pinned as roadmap; the proxy is stated as buffered by design (an HTTP API Lambda integration cannot stream; statement chunking fits the ceiling). Keep-source is removed by owner decision, not deferred: review-time peek and the owner's own re-downloadable filing serve source-checking at one seat, so the durable server copy was priced and declined. The original finding follows.*

Verified deltas against backend spec §6–§7: the keep-source toggle has no code path, and uploads lifecycle-delete after 7 days, so a confirmed upload's page-reference provenance dangles after a week; the proxy buffers rather than streams; the wire schema is PDF-only against the spec's PDF/XLSX/CSV with a SheetJS stage; and "size enforced as conditions on the presigned PUT" overstates S3 (the real gate is the head re-check in `createExtraction.ts:139-144`). Each misleads the spec's next reader; the repo's own rule is spec-and-code move together. **Direction:** one spec amendment recording the staging honestly; decide keep-source (implement the copy into a user prefix, or amend it out) before uploads see real use.

### BE-7 · P3 · Idempotency records are globally keyed

PK is the bare idempotency key; userId is checked on read but not on write, so a colliding key from another principal would silently replace a stored replay (`apps/api/src/db/idempotency.ts:9,29-49`). Theoretical at one seat; trivial now, breaking later. **Direction:** fold the user into the partition key or write conditionally.

### BE-8 · P3 · LWW comparison can diverge between JS and DynamoDB

The in-process tiebreak compares UTF-16 code units; the conditional expression compares UTF-8 bytes; they disagree for deviceIds mixing surrogate pairs with the U+E000–U+FFFF range, and the schema permits any 1–64-character string (`apps/api/src/sync/core.ts:35`, `syncStore.ts:161`). **Direction:** constrain deviceId's charset in the wire schema so the asymmetry is unrepresentable.

### BE-9 · P3 · One bad year aborts a whole ingest; a stale cache row can wedge a ticker

A single year failing the storage-schema parse throws out of the mapping and fails the entire ticker (endless 202s) rather than quarantining that year, against the blast-radius intent of backend spec §5 (`apps/api/src/edgar/mapping.ts:475-514`, `ingest/core.ts:72-91`). Sibling trap: a DOC# cache row that stops parsing after a schema tightening reads as absent but refuses overwrite, wedging that ticker's ASX ingest. **Direction:** per-year catch-and-quarantine; allow overwrite on a parse-failed cache hit.

**Also noted (spec tensions, §9):** the error-envelope pin cannot hold for gateway-generated responses; the first full-library push will throttle against the sync index's 5-WCU carve-out and converge over multiple runs with nothing surfacing why.

---

## 6. Frontend architecture

### FE-1 · P1 (fixed) · No error boundaries; the pinned escape hatch does not exist

*Fixed 2026-07-19 (`d51f4cd`): a `RegionBoundary` component with the pinned three affordances wraps every sheet body, the three Recharts surfaces, review mode, and the import-job strip, with `defaultErrorComponent` on the router as the screen-level backstop; the export escape hatch downloads the real library file through a shared path. Eight tests drive real crashes. The original finding follows.*

Frontend spec §2 and main plan §5 pin per-feature-region boundaries with a friendly message, retry, and an "Export my data" escape hatch; the stated rationale is that a chart crash must never take down a grid holding unsaved keystrokes. A repo-wide search finds no ErrorBoundary, no `errorComponent`, no `defaultErrorComponent` on the router (`apps/web/src/main.tsx:13`, `routes/__root.tsx`). A render-time throw falls to TanStack Router's bare default at whole-route blast radius. Recharts now renders in four places, including inside the entry route via review mode, which is precisely the pinned scenario. **Direction:** one small designed boundary component (message, retry, export link reusing the settings export path) around chart regions, sheet bodies, and each route's feature region, plus a router-level backstop.

### FE-2 · P1 (fixed) · A network blip at token refresh signs the device out

*Fixed 2026-07-19 (`d1af36e`): `getAccessToken` now answers three ways (token / signed_out / unavailable); only a definitive refusal deletes the session, while an unreachable endpoint keeps it and fails the run into the scheduler's backoff. Four tests pin the boundary. The original finding follows.*

`tokenCall` returns `undefined` identically for a thrown network error and a definitive OAuth rejection; `getAccessToken` deletes the session on any `undefined` (`apps/web/src/auth/session.ts:81-96, 156-172`). Signed out, the scheduler stops entirely, so a captive portal or DNS blip at refresh time permanently halts sync until the owner notices the settings row. Queued writes survive locally but stop draining, silently ending the retry-until-accepted obligation of the source-of-truth decision (main plan §12.9). **Direction:** delete the session only on a definitive `invalid_grant`-class response; treat network failure and 5xx as a failed run owned by the existing backoff.

### FE-3 · P1 (fixed) · The service worker force-reloads the app mid-session

*Fixed 2026-07-20 (`2d100f1`): `registerType` changed from `'autoUpdate'` to `'prompt'`, `skipWaiting` removed, `clientsClaim` kept for first-install control. The options extracted into a data module (`pwaOptions.ts`) with two tests pinning the three load-bearing choices. The original finding follows.*

`main.tsx` says "updates apply on the next launch, with no update ceremony", but the Workbox config sets `registerType: 'autoUpdate'` with `skipWaiting: true` and `clientsClaim: true` (`apps/web/vite.config.ts:45-53`), and the installed register client reloads the window on update. A deploy landing mid-entry reloads the page under the owner, dropping focused uncommitted field text and up to 900 ms of thesis draft, against the no-lost-work discipline (main plan §4). **Direction:** make the comment true (drop skipWaiting/clientsClaim so the waiting worker activates next launch), or keep autoUpdate and flush pending commits in an update hook; fix the comment either way.

### FE-4 · P3 (re-scored from P2) · One unparseable pulled record wedges sync permanently

*Single-device re-score (2026-07-19): the device only pulls back its own pushes, which it can parse; the wedge needs a record written by a different app version (a second device on a newer build) or storage corruption. Latent; reactivates to P2 the day a second device syncs. Cheap enough (a `schemaVersion` check) to fold in with FE-10 regardless.*

`applyRecord` parses with `.parse()` inside a run with no per-record catch; the checkpoint persists only at run end (`apps/web/src/sync/engine.ts:62-89, 143-175`). Any corrupt payload, or a record pushed by a newer app version, fails every subsequent run at the same point forever while reads silently stale. The envelope's `schemaVersion` is written but never read; the Dexie layer has quarantine machinery for exactly this class, the wire has none. **Direction:** check `schemaVersion` before parsing; on parse failure quarantine the raw record, advance past it, and surface it in settings beside the existing read-quarantine count.

### FE-5 · P2 (fixed) · Extraction can mint "not reported, treat as zero" without the user's assertion

*Fixed 2026-07-20 (`58be7b5`): the first direction was taken. A `notPrinted` claim now seeds nothing; the field stays absent (blocking completeness like any missing figure) and the claim rides the year model as a hint, shown as a quiet cell note and one banner line. The minting path is the field's own menu, the same S5 affordance, so only the user asserts the state; an asserted zero saves as the reviewer's own figure without per-field extraction provenance. No spec moved: the code now matches the already-pinned §8. The original finding follows.*

The review model maps the model's `notPrinted` claim to the known-zero state, and at confidence ≥ 0.7 no individual confirmation is required (`apps/web/src/features/review/reviewModel.ts:57-58, 96-105`). Data-model §8 pins that only the user asserts that state and extraction never invents one. A whole-review save can therefore store a zero the user never explicitly asserted, which then feeds computations. **Direction:** seed `notPrinted` fields as absent-with-a-hint, or force per-field confirmation for every such claim; the entry grid's overflow menu stays the only minting path.

### FE-6 · P2 (fixed) · Review save is non-atomic while claiming "Nothing was stored"

*Fixed 2026-07-20 (`d289b98`): `upsertStatements` wraps the per-statement loop in one Dexie read-write transaction over `[statements, companies]`, and each inner write's own transaction joins it, so a failure at any write rolls back every earlier one, `dataVersion` bumps included. The banner's "Nothing was stored" is now true by construction. The original finding follows.*

Confirmed review figures save via sequential per-statement transactions; a failure at write N leaves earlier statements persisted while the banner asserts nothing was stored (`apps/web/src/features/review/ReviewMode.tsx:220-227, 304`). A direct honesty bug in the product whose credo is trustworthy numbers. **Direction:** one Dexie read-write transaction across the loop so the message becomes true.

### FE-7 · P2 · Entry commits can drop a just-committed neighbour

`handleCommit` merges the new field into values taken from the live-query render and puts the whole row; a commit racing the previous commit's re-emission builds on stale values and drops the earlier field (`apps/web/src/features/entry/EntryScreen.tsx:197-224`). The window is tens of milliseconds, but Enter-commits-and-move invites rapid sequences and the journey test already documents racing a commit. **Direction:** merge inside the transaction (re-read the current row in the upsert) rather than trusting render state.

### FE-8 · P2 (size half fixed) · Two pinned CI stages do not exist

*Partly fixed 2026-07-22 (`5052970`): the size budget is now enforced by a dependency-free `scripts/check-bundle.mjs` that gzips the built entry module and its modulepreload graph and fails CI over 180 KB, with main plan §5 amended to record it (and that Lighthouse CI and the TTI budget stay unenforced). Measuring the real graph corrected the figure below: initial JS is 172.1 KB, not 78 KB, since the route definitions statically reach the Dexie layer and Zod schemas, so the gate has 7.9 KB of headroom and is load-bearing now, not a formality. The lint half stays open: no eslint stage exists and the install-or-record decision is still owed; the finding remains open on that half. The original finding follows.*

Main plan §7 pins the pipeline as "lint → typecheck → ..." and §5 pins performance budgets "enforced in CI (Lighthouse CI + size-limit): initial JS ≤ 180 KB gzipped". No eslint config, dependency, or script exists anywhere (a vestigial `eslint-disable-next-line` survives in `ImportTickerSheet.tsx:103`), and no budget check exists in ci.yml. The shell is comfortably under budget today (78 KB gzipped, measured), but unenforced budgets only degrade, and the first accidental static import of Recharts or pdf.js lands silently. **Direction:** add size-limit on the shell chunk now (cheap, high value); either install the lint stage or record its absence deliberately per the ADR discipline.

### FE-9 · P2 · Proxy-mode extraction has no client path despite the completeness claim

No reference to `/v1/uploads`, `/v1/extractions`, or `/v1/proxy` exists anywhere in `apps/web/src` (grep-verified); the provider probe's own comment says the server proxy is awaited, and upload providers filter to keyed, browser-callable entries only. Frontend spec §6 pins the extraction-job hook covering proxy polling, and CLAUDE.md declares the BYOK proxy landed within Phase 3 code-complete: the server half did, the client half did not. **Direction:** land the client path, or annotate CLAUDE.md and the spec's hook row as server-ready, client-pending.

### FE-10 · P3 · Dexie migration shipped without the pinned upgrade-fixture test

The version-2 migration landed with shape tests only; data-model §9 pins a previous-version fixture upgrade test, and none exists (`apps/web/src/db/db.ts:69-71`). The first cross-version device pair is where this and FE-4 intersect. **Direction:** a fixture-based upgrade test per migration from here on.

### FE-11 · P3 · Sign-in affordance reads connectivity non-reactively

`SettingsScreen` reads `navigator.onLine` during render; reconnecting while the screen is open never reveals the sign-in button, though `useOnlineStatus` exists and is used by every other online-gated surface (`apps/web/src/features/settings/SettingsScreen.tsx:119`). **Direction:** swap it in.

---

## 7. Product and interface

### UI-1 · P0 · The detail sheet's substituted formula is false for averaged denominators

The engine computes ROE and ROIC on the average of opening and closing balances whenever the prior year's balance sheet is complete (the averaging basis, data-model §4; `packages/calc-engine/src/metrics.ts:169-182`). The sheet's substituted formula and inputs list resolve every token from the latest year only (`rowFor` filters `row.fy === latestFy`; `apps/web/src/features/dashboard/MetricSheet.tsx:89-92, 99-114`). For CSL's FY2025 the sheet prints, in effect, "net income $3.00b ÷ total equity $21.4b = 14.7%", where that division is 14.0%: the equation asserted does not hold, and the prior-year balance actually used appears nowhere. ROIC is worse: its NOPAT, clamped tax rate, and invested-capital intermediates are unshown and nothing substitutes at all. The basis badge does say "average basis", but the success criterion (main plan §13) is reproduction by hand from the sheet, and every multi-year company is affected, including all five ASX samples. It survived 100% coverage because the substituted-formula tests stop at a single-year fixture. **Direction:** substitute what was used ("÷ average total equity: ($21.4b + $19.4b) ÷ 2"), list the prior-year balance as an input row with provenance, render ROIC's derived intermediates as derived rows, and add the guard the trust promise deserves: a test that evaluates the substituted expression and compares it to the displayed value within rounding, for both bases. No pinned decision moves; this makes two pinned contracts consistent with each other.

### UI-2 · P1 (fixed) · The first screen states the superseded architecture as fact

*Fixed 2026-07-20 (`6989e57`): pane 2 and the signed-out settings note now state the catch-up truth (a working copy on the device, the durable copy behind sign-in, export as portability); frontend spec S1 and S9 moved in the same change, completing the §12.9 documentation pass and resolving plan tension 5; and a copy-contract test pins the new claims and the absence of the superseded strings (forward risk 5's guard). Verified live in the browser. The original finding follows.*

First-run pane 2: "Everything you enter stays on this device, no account and no server, and the app works fully offline... Nothing leaves without you" (`apps/web/src/features/onboarding/FirstRun.tsx:25-31`). One day earlier, the source-of-truth decision (main plan §12.9) made DynamoDB the authoritative store, warehoused the owner's research server-side, and put a sign-in in Settings on the same build. The first thing the app tells its user is factually wrong about where their data lives. The signed-out settings row soft-pedals the same way, faithfully implementing the unamended spec wording (see §9). **Direction:** reword pane 2 to the catch-up truth (works offline against the synced copy; signing in keeps devices in step and holds the durable copy; export any time) and amend the frontend spec's first-run and settings copy in the same change, completing the §12.9 documentation pass.

### UI-3 · P1 (fixed) · The pinned storage-pressure states were never built

*Fixed 2026-07-20 (`f83e4a1`): the entry screen carries the proactive quota-low banner (`useStorageStatus` gained a four-fifths threshold), and a pure-boundary 30-day export nudge shows on the data screen and settings root, both gated on a non-empty library. Plan tension 6 dissolved on inspection: §14 had already been amended for §12.9 and deliberately kept both mitigations, so no spec decision was owed. Verified live. The original finding follows.*

Frontend spec §3 pins a non-blocking quota-low banner on the entry screen and an export nudge fed by the last-export date; main plan §14 pins proactive detection "before writes begin failing". Neither exists: `useStorageStatus` has no threshold logic, the entry screen shows only an after-failure ticker, and the settings data screen displays the last-export date that nothing consumes. The first symptom of storage pressure is a failed save. **Direction:** a threshold in the hook feeding a quiet banner, and a one-line nudge off `lastExportAt`; or, if the source-of-truth posture genuinely demotes these states, amend the spec rather than leaving them silently unbuilt.

### UI-4 · P2 · Last-synced is a bare wall-clock time

`toLocaleTimeString()` yields "3:42:17 pm": seconds noise, no day, ambiguous once older than today, and inconsistent with the house pattern (relative words plus ISO) used in the library and thesis history (`apps/web/src/features/settings/SettingsScreen.tsx:36-40`). **Direction:** reuse the relative-updated pattern.

### UI-5 · P2 · Px-only tokens ignore the browser's text-size preference

Every fontSize token is in px, so the user's font-size preference has no effect (only full-page zoom scales), against the pinned dynamic-type test point (main plan §4). **Direction:** express the same pinned steps in rem, or record zoom-only scaling as an accepted deviation.

### UI-6 · P2 · Degenerate values hang on `aria-label` over generic spans

History cells and short-form renderings put the full phrase in `aria-label` on bare spans; naming is unreliable on generic roles (a hazard the dashboard design plan itself records, which is why the health dot got `role="img"`), and the label also suppresses the visible short text without a guaranteed replacement (`apps/web/src/components/MetricCard.tsx:90-96`, `MetricTable.tsx:65-72`). Related corner: on an empty company, a hand-typed deep link to a companion metric renders "n/m: no price" when the true state is no data (`MetricSheet.tsx:293-299`). **Direction:** visually hidden text beside the short form (the pattern already exists in these files), and an honest fallback reason.

### UI-7 · P3 · Table band headers use the wrong scope

The spanning group header inside each tbody carries `scope="colgroup"`; it heads rows, so `rowgroup` is correct (`apps/web/src/features/dashboard/MetricTable.tsx:171`).

### UI-8 · P3 · Motion deviations are unrecorded

The pinned once-only 30 ms card stagger (main plan §4) is implemented nowhere; the first-run panes' reduced-motion variant replays translate keyframes at 150 ms instead of collapsing to a pure fade (the sheet shell shows the correct pattern); sheets rise generically rather than from the tapped card. The trends section shows the house practice for declining ceremony with a recorded note; these have none. **Direction:** implement or record; fix the reduced-motion keyframes either way.

### UI-9 · P3 · Light mode's segmented control has no visible selection

Group and active segment resolve to the same white in light mode, so selection reads only through text weight; dark mode gets the intended step. The control now carries load-bearing state (cards/table, year range, statements). **Direction:** a fill or border step for the light selected state.

### UI-10 · P3 · Token strays

`letterSpacing: '0.2em'` outside the three tracking tokens; display tracking applied at 22 px where the plan pins it to 28/34; hard-coded toggle-switch geometry; scattered layout min-widths. All optically reasonable; the token file's own contract says values need tokens. **Direction:** name them as component-geometry exceptions or tokenise.

---

## 8. Infrastructure and cost

### INFRA-1 · P1 (fixed) · The deployed CSP blocks the shipped sign-in flow

*Fixed 2026-07-19 (`b306b74`): connect-src now names the deterministically derived hosted-UI origin while `features.auth` is on; the invariant expectation and the cdk spec §6 formula moved in the same commit, and the live edge was confirmed serving the origin. The original finding follows.*

The response-headers policy pins `connect-src 'self'` (provider origins list is empty in prod config; asserted by full-string equality in the invariant suite, so the test currently certifies the breaking value). The auth client shipped 2026-07-18 fetches the Cognito hosted domain (`https://plainsight-prod-679345828813.auth.ap-southeast-2.amazoncognito.com/oauth2/token`) for the PKCE code exchange and refresh (`infra/lib/stacks/static-site.ts:20-36`, `apps/web/src/auth/session.ts:20,86`). The browser will block that fetch: prod sign-in, and therefore sync, fails at the owner's very next runbook step. **Direction:** derive the hosted-UI origin deterministically from config, join it into connect-src, and amend the cdk spec §6 formula and the test expectation in the same commit.

### INFRA-2 · P1 (fixed) · The PR diff job cannot assume the deploy role

*Fixed 2026-07-20 (`97d407b`): a dedicated `plainsight-github-diff` role now serves the diff job, trusting exactly the `pull_request` subject (a full-string match, no wildcard) and reaching no further than assuming the CDK lookup role, pinned by both an inline grant and its own permissions boundary; the deploy role stays main-only. The diff runs `--no-change-set` (template-only), the OIDC invariant block was reworked to a closed set of two roles, and the cdk spec §7 and infra README arming step moved in the same commit. Activation needs the `AWS_DIFF_ROLE_ARN` repository variable set from the new `DiffRoleArn` output. The original finding follows.*

The diff job runs on `pull_request` and assumes the deploy role, but the role trusts only `ref:refs/heads/main` and `environment:*` subjects; a pull_request-triggered run presents a `pull_request` subject matching neither (`.github/workflows/infra.yml:64-96`, `infra/lib/stacks/github-oidc.ts:81-87`). Every infra PR since arming would fail at the credentials step, so the compensating control ADR 0001 names first, PR-time diff review, never actually runs. **Direction:** a separate read-only diff role trusting the pull_request subject, permitted only to assume the CDK lookup role; keep the deploy role main-only.

### INFRA-3 · P1 (fixed) · The cost-anomaly monitor likely watches a non-existent tag key, and the chain is unverified

*Fixed 2026-07-20 (`36e4a4f`), and the "likely" is now confirmed against the primary sources. The two services genuinely disagree on tag-key shape: Budgets requires the `user:` prefix on user-defined keys (its filter documentation), so the budget's `user:project` was correct; Cost Explorer expressions take the bare key (every tag-monitor example in the CreateAnomalyMonitor API reference is unprefixed), so the monitor's `user:project` matched nothing and watched no spend, silently. The monitor now filters on bare `project`, both filters carry comments and both test pins carry cross-references stating the asymmetry is each service's documented form so neither is unified to the other, and the two directed procedures landed as runbook steps 9 and 10 (verify each key form against real spend a day after activation; fire the kill chain once with a hand-published SNS message). The monitor's specification is create-only, so the deploy replaces it and it re-baselines over ~10 days. The chain firing and the verification remain owner steps, now written down. The original finding follows.*

Both the budget filter and the anomaly monitor use the key `user:project` (`infra/lib/stacks/foundation.ts:198-200, 217-223`). For Budgets the prefixed form is documented correct; for the anomaly monitor's Cost Explorer expression, AWS's own examples use the plain key, and if CE treats `user:project` literally the monitor matches no spend forever, silently. Honestly marked: not conclusively verifiable from documentation alone. The larger point stands regardless: the entire protection chain (tag activation → tag-scoped budget → SNS → flipper → SSM flag → extraction declines) has never been observed firing, several links fail silent, and the not-list's justification leans on this chain working. **Direction:** verify both key forms with one Cost Explorer call once tagged spend exists; add a runbook step after tag activation confirming the budget's calculated spend is non-zero; fire the kill chain once deliberately.

### INFRA-4 · P2 (fixed) · The retired gate left a live trust-policy widening

*Fixed 2026-07-20 (`a6126ab`): the `environment:*` subject is gone; the deploy role trusts only the main-push subject, now as an exact `StringEquals` pinned by full-document equality so the wildcard cannot return. The main-push subject is untouched, so the deploy applying the change cannot lock the pipeline out. The original finding follows.*

The deploy role still trusts `environment:*` subjects, added for the stateful gate and now used by nothing legitimate. Any workflow job in this repo that declares any GitHub environment (auto-created unprotected on first use) can assume the deploy role from any ref: a widening beyond the cdk spec §2 trust posture, reachable by anything that can push a branch (`infra/lib/stacks/github-oidc.ts:80-87`). **Direction:** drop the subject and its test expectation now the gate is retired.

### INFRA-5 · P2 · Unauthenticated requests can spend canonical extraction keys once Phase 2.5 arms

The financials route is deliberately unauthenticated (pinned: import works signed out), and a cold `.AX` ticker on it fires ingest, which delegates to the key-spending extract function (`infra/lib/stacks/api.ts:96-121`, `ingestion.ts:196-197`). cdk spec §8's sentence that the spendable surfaces "sit behind Cognito and the kill-switch flag" is therefore half-true for this path. Real bounds exist (10 rps throttle, the extract-once cache, a finite ticker space, the kill switch, provider-side caps), so this is wording plus cheap hardening, not a hole. **Direction:** amend the §8 sentence; before arming keys, consider a free hard bound (reserved concurrency on the extract function, or a global daily extraction counter beside the job quota). No WAF; the not-list holds.

### INFRA-6 · P2 · Account-wide CloudFront invalidation grant, justified by a stale claim

Ingest and extract roles hold `cloudfront:CreateInvalidation` on `distribution/*`, acknowledged as safe because "the account has exactly one distribution", written before ADR 0001's amendment recorded the account as shared with other tenants whose distributions this grant could invalidate (`infra/lib/stacks/ingestion.ts:99-129, 269-274`). **Direction:** scope with a resource-tag condition (verify the action supports it), or at minimum correct the acknowledgement to price the cross-tenant reach honestly.

### INFRA-7 · P3 · Invariant sweep gaps against the cdk spec §6 universals

"Every Lambda: timeout, log retention, ARM64" is asserted exhaustively only for the Api stack; the ingestion functions get sizing and tracing checks but no retention assertion, the flipper none; a future raw function with default infinite retention would pass. Cognito token lifetimes are unpinned in code and test (60-minute access, 30-day refresh defaults): defensible at one seat, worth pinning or recording. **Direction:** one all-stacks sweep test in the shape the bucket sweep already uses.

### INFRA-8 · P3 · Dev origin baked into prod, unrecorded

The prod Cognito client's callback and logout URLs and the uploads bucket CORS include `localhost:5173` (`infra/lib/stacks/auth.ts:86`, `data.ts:137`). Coherent with the no-staging posture (dev runs against prod) and bounded by PKCE and presigned auth, but recorded nowhere. **Direction:** one sentence in ADR 0001.

---

## 9. Plan tensions

Places where a pinned contract itself needs a decision, recorded here rather than as findings:

1. **The error-envelope pin cannot hold everywhere.** Backend spec §2 pins the envelope on every non-2xx, but HTTP API gateway-generated responses (authoriser 401s, throttle 429s, oversize 413s) cannot carry it. The client tolerates this; the spec should annotate it.
2. **Initial-sync burst versus the pinned capacity carve-out.** A first full-library push (hundreds of rows) will throttle against the sync index's 5 WCU and converge over multiple runs. Retry-until-accepted absorbs it, but the capacity maths never priced the burst and nothing surfaces the slowness; a sentence in the spec and a throttle alarm would.
3. **The CSP formula never anticipated auth.** cdk spec §6 pins connect-src as exactly self plus provider origins; Phase 3's own design (hosted UI, PKCE in the SPA) requires the Cognito origin. INFRA-1's fix forces the amendment; the formula's API-origin term also turned out vestigial since CloudFront made the API same-origin.
4. **Does a human checkpoint exist on stateful deploys?** *(Settled 2026-07-20 with X-2, commit `ac9bea7`.)* No, deliberately: ADR 0001's second amendment now agrees with the cdk spec that the structural protections carry the load, so the two documents no longer disagree. The load-bearing control is that only the owner can push to `main`; the amendment records that `main` carries no branch protection (verified 2026-07-20) and names it the first thing to change if anyone else gets push access.
5. **Signed-out copy under the new contract.** Frontend spec S1/S9 wording ("nothing needs it") survives from the local-first era; under the source-of-truth decision, durable storage does need sign-in. The code faithfully implements the stale spec (and pane 2 overstates it, UI-2); the spec passages need the §12.9 treatment.
6. **Export-pressure states under the new posture.** *(Resolved 2026-07-20 with UI-3, commit `f83e4a1`.)* The question was whether §12.9 demoted the quota banner and 30-day nudge; it had not. §14 was already amended for §12.9 and kept both, on the stated grounds that unsynced device-local writes are real and re-download is friction. Both states are now built, so the silence the finding named is closed in both directions: the spec says they matter and the code implements them.
7. **"Pending writes" is a fingerprint diff, not a queue.** The implementation recomputes a full-store diff on every write to any synced table. Correct and elegant at persona scale, quadratic-ish in spirit; worth one recorded sentence so the next reader does not "fix" it or fear it.

---

## 10. Forward risks

1. **The dormant second device.** Single-device operation (owner posture, 2026-07-19) keeps BE-1, BE-3, BE-4, and FE-4 latent, but they reactivate the instant a second device syncs, and the fake-store tests cannot see any of them. If a second device is ever added, a DynamoDB Local integration pass plus one rehearsed two-device walk is the pre-condition, not an afterthought.
2. **Silent sync-health degradation.** Failure surfacing is deliberately quiet (a settings row), so a wedged or signed-out sync looks identical to a healthy idle one. A staleness surface (the library noting "last synced N days ago" past a threshold) would cap the blast radius of every future sync bug, including the ones not yet written.
3. **The cost chain fires for the first time in production.** Arming Phase 2.5 keys converts INFRA-3 and INFRA-5 from latent to live on the same day, and the alert email subscription is still unconfirmed. Fire the chain once on purpose before the keys exist.
4. **Traceability has no automated guard.** UI-1 survived a green 100%-branch suite because nothing asserts the sheet's substituted arithmetic equals the displayed value. As benchmark lines, the library table, and deeper provenance land, that guard becomes the product's central regression test.
5. **Copy-truth drift.** The style checker machine-enforces Markdown only; UI strings asserting architecture ("no account and no server") rot silently as the sync story evolves. A small test pinning the first-run and settings claims to the current contract would have caught UI-2 the day it went stale.
6. **Growth pressure on the card face.** MetricCard is at roughly 11 props against the spec's own ~8-prop design-review tripwire, with the finance-look staging queueing more face-level additions (benchmarks, the library table). The next addition should trigger the pinned review rather than another prop.

---

## 11. Recommended sequence

1. **Restore the trust invariant (UI-1). Done 2026-07-19 (`08ba083`, `41837c3`).** Substituted the averaged denominator, listed the prior-year input, rendered the ROIC intermediates, and added the evaluate-the-substitution test across all fourteen metrics on both bases. This was the product's founding promise; it outranked everything else.
2. **Unblock sign-in (INFRA-1). Done 2026-07-19 (`b306b74`).** Cognito origin into connect-src, the spec §6 formula and invariant expectation amended in the same commit, verified live on the edge.
3. **Rehearse the single-device path (X-1; FE-2 done `d1af36e`).** Token refresh is now blip-tolerant (FE-2 fixed 2026-07-19), so what remains is the walk itself: sign-in → first sync → upload once against the real backend, then one deliberate firing of the budget kill chain. The sync-convergence fixes (BE-1, BE-3, BE-4, FE-4) are deferred under single-device operation; schedule them as the pre-condition for ever adding a second device, not for this go-live.
4. **Protect unsaved work (FE-1 done `d51f4cd`; FE-3 done `2d100f1`).** The designed error boundaries landed (per-region plus a router backstop, message/retry/export), and the service worker now waits for the next launch instead of reloading mid-session. Both defences of the owner's in-flight keystrokes are in place.
5. **Make uploads honest before they are used (all done): BE-2 `4288746`, BE-5 `9f68456`, FE-5 `58be7b5`, FE-6 `d289b98`, BE-6 `ae42567`.** Gates in the worker, quota refunds plus the runbook reset, user-only known-zero minting, the atomic review save, and the upload/proxy spec amendments (keep-source removed by owner decision, the rest recorded as staging) are all landed.
6. **Close the pipeline's own gaps (INFRA-2 done `97d407b`; INFRA-3 done `36e4a4f`; INFRA-4 done `a6126ab`).** The read-only diff role landed, so the diff-is-the-review control can run once its variable is set; the anomaly monitor now watches a tag key that exists, with the chain-firing written up as a runbook drill; and the deploy role has shed the retired gate's `environment:*` trust. The pipeline-gaps group is closed.
7. **One documentation commit (done `ac9bea7`).** X-2 swept every drift instance into agreement, FE-9's claim was annotated server-half/client-pending in the same pass, and plan tensions 4, 5, and 6 are all settled (4 with X-2, 5 with UI-2's `6989e57`, 6 with UI-3's `f83e4a1`). The only wake left is FE-9's client half itself, which is code, not documentation.
8. **Harden the gates (X-3, FE-8, FE-10, INFRA-7).** Size-limit on the shell landed 2026-07-22 (`5052970`, FE-8's size half). What remains: the infra test timeout (X-3), FE-8's lint decision (install or record), the migration upgrade-fixture pattern (FE-10), and the all-stacks Lambda sweep (INFRA-7).

Then the queue is what it already was: the owner actions (alert email, cost tag, the bake-off and ladder pinning, the ASX interpretation-notes review, account creation) and, when ready, pinning or parking the three direction drafts. The remaining P2/P3 findings (UI-4 through UI-10, BE-7 through BE-9, FE-7, FE-11, INFRA-5, INFRA-6, INFRA-8) slot naturally into the files each touches as that work lands.

---

## 12. Coverage and limits

**Gates at this commit.** Typecheck clean across all workspaces. Full test run green except three infra tests that exceed the default 5-second timeout on a cold cache and pass warm (X-3): calc-engine 333/333 with 100% coverage on all four axes, the web suites green (including 91 sync and db integration tests), infra 75/75 warm. Style checker clean (28 Markdown files, 402 source files). CI on `main` green through the latest commit, including the airplane-mode journey on Chromium and WebKit and the armed deploy jobs.

**What was reviewed.** All five plan documents, the four ADRs, the runbook, both workflows, and the three direction drafts in full. Backend: all of `apps/api/src` (sync core and store, all handlers, EDGAR and ASX clients, mapping, ingest paths, gates), `packages/api-contract` in full, `packages/extraction-core` (registry, ladder, shared and native adapters, proxy). Frontend: the sync client end to end, the Dexie layer, hooks, the dashboard/entry/review/library/settings/thesis/compare features, auth, routing, build config, and the built bundle (gzip-measured). Interface: the token and palette layer with its contrast gate, every sampled screen against its specified states, copy sweeps for buy/sell language, investor names, spelling, and date formats. Infrastructure: every line of `infra/` including all four test files and both snapshots, cross-checked against handler reality and AWS documentation where claims depended on it.

**Verification discipline.** Every P0 and P1 was confirmed in source by the lens reviewer and then independently re-verified (the substitution arithmetic, the CSP value and the cross-origin token fetch, the OIDC trust subjects, the non-atomic seq assignment, the ungated upload path, the error-boundary absence, the service-worker flags, the refresh sign-out path, the first-run copy).

**Limits.** No live AWS inspection (deployed state is inferred from IaC, snapshots, and the runbook); the app was not driven in a browser (interface findings are from source); Playwright suites were not re-run locally (CI green taken as evidence); calc-engine formula correctness beyond the corpus was not re-derived (the golden fixtures carry that weight); `extraction-core` prompt quality and the bake-off harness await the owner's keys and were reviewed for structure only. INFRA-3's Cost Explorer key question is explicitly marked unverifiable from documentation alone and comes with its own verification step.
