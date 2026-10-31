# Lab 4 Peer Review and Evidence Record

Status: **contract and PRs #95–#99 peer-reviewed and merged; Issue #90 / PR #100 awaiting human review; release pending**. Prepared 2026-10-23; review ledger updated 2026-10-30. This file distinguishes actual events from pending review and test evidence.

Repository: [FramePongrit/toktickit](https://github.com/FramePongrit/toktickit). Baseline: main 1a20e3465922a2c1dacc5a9eb18e55b0840284b8, [Lab 3 release PR 83](https://github.com/FramePongrit/toktickit/pull/83). Integration branch: lab4-staging. Current contract branch: feature/lab4-engineering-contract.

## 1. Contract approval provenance

The stakeholder completed six decision rounds and clarification, accepted the consolidated shared understanding and authorized contract authoring on 2026-10-23. Approved deadline is October 29, superseding October 30; internal integrated release target is October 28. Repository documents are English.

Working capture is the user-requested external D:/Software Engineering/lab4_ai_use_staging.md. It preserves user prompts/inter-agent task prompts and summary agent answers, including prior interview decisions. It is not yet the curated repository ai-use.md. Do not copy an unreviewed entire working log into a public PR; later course evidence uses selected prompts and actual LLM identification/student reflection.

Contract commit 430cda5 was published before the first feature implementation started. [PR #94](https://github.com/FramePongrit/toktickit/pull/94) was approved by Sxr1n on 2026-10-24 at 16:42:50 Asia/Bangkok and merged into lab4-staging at 16:45:52, commit 954604e88c9a9b0f64b9e9c4fa727dfa7a990fc7. The reviewer explicitly reported reading specification.md and issue-plan.md in full; the approval is not represented as a full-file review of the other four documents.

| Item | Current verified state |
|---|---|
| Stakeholder interview and final authoring authorization | Received in current chat, 2026-10-23 |
| Contract Git commit | 430cda5; published before #85 implementation |
| Contract Issue/PR link | [Issue #84](https://github.com/FramePongrit/toktickit/issues/84), [PR #94](https://github.com/FramePongrit/toktickit/pull/94) |
| Peer reviewer identity | Sxr1n, collaborator, contract PR #94 |
| Peer approval/comments/responses | Contract APPROVED 2026-10-24 16:42:50 Asia/Bangkok; PR95 initial findings then corrected head0a75793 APPROVED by Sxr1n October26 03:01:15; merged4d487a1 at03:01:40 |
| Implementation test results | Initial source 6be4a1a and correction 9b29487 verified separately; results below; later Issues pending |
| Final main / release PR | Pending |

## 2. Per-Issue review ledger

Plan IDs come from [issue-plan.md](issue-plan.md). Published Issues are linked below. Replace Pending cells only after verified events; human approval is separate from AI review.

| Plan ID | Issue URL | Branch / PR URL | Reviewer identity | Comments / author responses | Approval / merge commit | Project state |
|---|---|---|---|---|---|---|
| L4-01 | [#84](https://github.com/FramePongrit/toktickit/issues/84) | feature/lab4-engineering-contract / [#94](https://github.com/FramePongrit/toktickit/pull/94) | Sxr1n | Seven clarification comments; response below | APPROVED; merged 954604e | Done |
| L4-02 | [#85](https://github.com/FramePongrit/toktickit/issues/85) | feature/lab4-data-migration / [#95](https://github.com/FramePongrit/toktickit/pull/95) | Sxr1n | Three human findings fixed; corrected head0a75793 re-approved | APPROVED October26 03:01:15; merged4d487a1 at03:01:40 Asia/Bangkok | Done |
| L4-03 | [#86](https://github.com/FramePongrit/toktickit/issues/86) | feature/lab4-actions-api / [#96](https://github.com/FramePongrit/toktickit/pull/96) | narakosi-dev; AI Reviewer checked617bd9d | APPROVED on e9a0401; suggested later complete Actions lifecycle E2E | APPROVED October28 01:59:55; merged e6e782d at02:01:37 Asia/Bangkok | Done |
| L4-04 | [#87](https://github.com/FramePongrit/toktickit/issues/87) | feature/lab4-ticket-workflow / [#97](https://github.com/FramePongrit/toktickit/pull/97) | Sxr1n; AI Reviewer confirmed99f9e45 | APPROVED05ec455; four nonblocking notes recorded below | APPROVED October28 16:49:09; merged030f5da October29 13:21:23 Asia/Bangkok | Done |
| L4-05 | [#88](https://github.com/FramePongrit/toktickit/issues/88) | feature/lab4-actions-ui / [#98](https://github.com/FramePongrit/toktickit/pull/98) | Sxr1n; AI Reviewer confirmed60e9d9d | APPROVED93c108e, no blocker; four follow-ups below | APPROVED October29 18:29:24; merged6b1277d at18:32:30 Asia/Bangkok | Done |
| L4-06 | [#89](https://github.com/FramePongrit/toktickit/issues/89) | feature/lab4-dashboard-api / [#99](https://github.com/FramePongrit/toktickit/pull/99) | Sxr1n; AI Reviewer confirmed 6f08f4e | Approved with Staff search fix requested; correction carried into #90 | Merged 171d8bc | Done |
| L4-07 | [#90](https://github.com/FramePongrit/toktickit/issues/90) | feature/lab4-dashboard-ui / [#100](https://github.com/FramePongrit/toktickit/pull/100) | AI Reviewer confirmed 5236ef5; human pending | Dashboard, navigation, PR99 Staff search correction; evidence below | Pending | PR Review |
| L4-08 | [#91](https://github.com/FramePongrit/toktickit/issues/91) | feature/lab4-quality-evidence / Pending | Pending | Pending | Pending | Backlog |
| L4-09 | [#92](https://github.com/FramePongrit/toktickit/issues/92) | feature/lab4-final-evidence / Pending | Pending | Pending | Pending | Backlog |
| L4-10 | [#93](https://github.com/FramePongrit/toktickit/issues/93) | lab4-staging -> main / Pending | Pending | Pending | Pending | Backlog |

For each PR, record review-comment permalinks, author's response/fix links, actual submitted approval identity/time and resolved threads. If an AI factual audit assists drafting, label it as such; it is not a peer approval or proof the product works.

### PR #94 peer-review response

Review source: [Sxr1n approval and findings](https://github.com/FramePongrit/toktickit/pull/94#pullrequestreview-5637798242), verified through the GitHub review API.

1. Duplicate replay and canonical digest: existing API section 6 already specifies advisory-scope locking, post-wait lookup and normalized submitted JSON; added BR-26 cross-reference and explicit JSON-formatting independence. UNIT-06/API-I01 remain required.
2. Follow-up: deliberately permit a reasoned/audited terminal correction to clear the flag; all other resolution prerequisites still apply. Specification and API-W02 assertions now state this directly.
3. Reopen: workflow event uses the resulting/new cycle; specification, API and API-W03 agree.
4. Dates: untouched create date may be omitted for server now; edited datetime-local means Bangkok independent of browser timezone. UI/API test expectations clarified.
5. Ineligible assignee: retain history and expose a safe Staff-only eligibility flag for a visible warning/reassignment control; no extra account-deactivation guard introduced.
6. Dashboards: explicit last 7 Bangkok calendar days including today; severity URGENT > HIGH > MEDIUM > LOW with regression assertion; Requester-authored public activity intentionally advances updatedAt.
7. Document hygiene: removed conversational authorization quotes and agent-skill instructions from graded contract prose. Operational instructions remain in the working AI log. Contract merge precedes every implementation PR merge; later peer review remains required.

These clarifications are included with the first implementation PR for human review. Their future API/UI tests remain planned until their respective Issues implement and execute them.

### PR #95 initial implementation review (October 24)

Implementation commit: 6be4a1a. Executor and Reviewer used Ponytail full. Reviewer inspected schema/migration, seed chronology/versioning/preservation, harness isolation/constraints, real restored-app auth/download, upload-root configuration, runbook and companion docs. Findings fixed: reopened timestamps, cycle timing, upgrade-only demonstration coverage, unfinished inactive assignments, operation-aware versions, modified legacy comments, SQL invalid-write coverage and guarded recovery. Final Windows path-normalization correction passed four mixed-separator containment assertions. Reviewer reported no remaining actionable findings and independently passed migration/recovery6; full server/security/build checks below are Executor results. This is AI review; human implementation approval is pending.

The initial implementation was tested before commit and committed as 6be4a1a. Initial evidence commit 0e958d5 changed documentation only. The later October 25 correction is product/test/runbook commit 9b29487, described below. PR #95 targets lab4-staging directly after contract merge 954604e; Issue #85 remains open until correction review and merge completion.

### PR #95 human-review corrections (October 25)

[Sxr1n's review](https://github.com/FramePongrit/toktickit/pull/95#pullrequestreview-5643863907) is recorded as APPROVED on 0e958d5 at 22:28:19 Asia/Bangkok, but its body explicitly requests three fixes before merge. It is not treated as approval of the later correction head.

1. **Workflow comment FK:** the old SET NULL policy conflicts with the waiting-event CHECK. Its deletion attempt failed and rolled back, rather than silently erasing a waiting event. Matching Prisma RESTRICT and a new atomic follow-up migration now preserve the reference explicitly. The published migration remains byte-for-byte unchanged. Fresh and already-applied-Lab4 upgrade tests assert PostgreSQL FK23503/constraint identity and unchanged row/attachment/history inventory.
2. **Independent restore and source integrity:** restore reads an explicit existing backup directory and validates dump/uploads/manifest/hash inventory before createdb. Backup hashes originals before copying and compares the copy. Executable fresh-session PowerShell regressions cover missing files, copy corruption, changed backup bytes and empty inventory. External DB tools are stubbed in those Windows script tests; PostgreSQL recovery/app smoke runs independently against the real test container.
3. **Reviewable execution evidence:** [complete sanitized command output](../../artifacts/lab-04/verification/README.md) is committed with commands, environment labels, exit codes and test totals. No GitHub CI workflow/check was added or claimed. A human review already exists; there was no outstanding requested-reviewer assignment. The new head still needs human re-review and merge.

The optional partial BASELINE unique index and unique event Ticket/version index were not required corrections. The proposed idempotency cleanup index is deferred because automatic expiry/cleanup is explicitly excluded by this contract. No new cleanup feature was introduced.

### PR #95 corrected-head approval and integration

[Sxr1n's corrected-head approval](https://github.com/FramePongrit/toktickit/pull/95#pullrequestreview-5644980389) was submitted on `0a75793` at 2026-10-26 03:01:15 Asia/Bangkok. PR #95 merged into lab4-staging at 03:01:40, commit `4d487a1496ad6d65bb3743e1b6093b81f2902bf0`. Issue #85 is closed and its card Done. Historical references above to pending re-review describe the earlier October 25 handoff. Issue #86 begins from this exact reviewed merge; its tests/approval are not inherited from Issue #85.

Correction verification: Executor passed server 19 files/206 tests and migration/recovery/runbook 4 files/12 tests, plus Prisma validate/generate/build. Reviewer found no remaining actionable findings versus 0e958d5..9b29487 and independently repeated 12 tests in 4 files with zero failures/skips (103.31s, runner start 22:59:35 Asia/Bangkok on October 25). [Complete reviewer output](../../artifacts/lab-04/verification/reviewer-migration-recovery.txt) and the other logs identify scope, environment and exit status. Later evidence commits contain only documentation/artifacts; no product change followed this review. These local passes do not constitute GitHub CI or human approval of the corrected head.

### Issue #86 AI review and verification

AI Reviewer found and Executor corrected double pagination parsing, revoked-session error precedence, stale status controls after Claim/Reassign and loss of the request key on HTTP500 retry. The review also added real lock-wait/session revocation, same-Action/finality races, Requester/CSRF/cross-Ticket/terminal-edge cases and corrected the Reassign test to exercise empty-to-enabled controls. Browser testing found an IdempotencyRecord fixture-teardown FK; cleanup is scoped to fixture User IDs and the full targeted file passed afterward. Reviewer independently passed21tests and confirmed no actionable findings on source `617bd9d65bf11dbc221a8f7ad839d0bb871c171b`, including the fixture delta. This is AI verification, not human peer approval.

Final local results: server227, client151, migration12, security21, targeted browser2, both builds and diff integrity passed. [Complete Issue86 evidence](../../artifacts/lab-04/verification/issue86/README.md) preserves commands, outputs and environment. The earlier application DB was not migrated. #87 workflow scope and human review/merge remain pending.

### PR #96 human approval and integration

[narakosi-dev's approval](https://github.com/FramePongrit/toktickit/pull/96#pullrequestreview-5672719657) covers the complete evidence head `e9a04017e3a7eb9f5bc5a5fc5cdfdd103d73d654`, October 28 at 01:59:55 Asia/Bangkok. [PR #96](https://github.com/FramePongrit/toktickit/pull/96) merged at 02:01:37 as `e6e782da2a8d8a75b592a86fa48f09711f32357a`; Issue #86 closed at 02:02:43 and its card is Done. The review suggested expanding complete Actions lifecycle browser coverage, concurrency/retry/error paths from the user's perspective. That suggestion is retained for the Actions UI/quality increments; it is not falsely claimed covered by the two Staff regression browser cases. Issue #87 starts from this exact reviewed merge. Earlier pending-human-review wording records the October 26 handoff.

### Issue #87 AI review and verification

Executor corrected preliminary feedback for TicketDetail field placement, explicit public event projection/BASELINE label, honest unknown legacy resolution-time wording and cancellation intent reset between Ticket IDs. Reviewer requested and verified cancelled-only rejection, repeated cycle/replay/retained Close time, unchanged terminal Actions during cancellation and authorized final workflow reads. It also caught invalid Waiting-event fixtures and helped diagnose race harness scheduling; corrected barriers observe real PostgreSQL lock waits. No product deadlock was found from those race failures. Legacy assertions remain intact, with scoped FK cleanup and valid completion/reason fixtures.

AI Reviewer independently ran the new rules/workflow files: 2files/9tests passed, zero failures/skips,5.56s. It inspected the final cross-Ticket UI regression and confirmed no actionable findings on source `99f9e450fa5bef4c8080dd82aa064ed793ea3479`. Complete local verification passed server236/client153/security21/migration12/browser2 and both builds. [Complete Issue87 evidence](../../artifacts/lab-04/verification/issue87/README.md) identifies source, environment, commands, output and cleanup. These are local/AI checks; no human approval or CI result is claimed. Full Actions UI and release evidence remain later increments.

### PR #97 human approval and integration

[Sxr1n's approval](https://github.com/FramePongrit/toktickit/pull/97#pullrequestreview-5680692933) covers `05ec4551dd5d59aa67d0d20041901b01621f4099`, submitted October 28 at 16:49:09 Asia/Bangkok. PR #97 merged October 29 at 13:21:23 as `030f5da261b45d88332ea518a7a5c8ae6b5ffe9a`. Issue #87 is merged/Done; Issue #88 starts from that exact reviewed head. Earlier pending-human-review text describes the prior handoff.

The review explicitly found no merge blocker and raised four small points. Ticket.version increments once for parent cancellation, while each unfinished Action gets its own revision/version; this is already explicit in api-spec section1/5 and the multi-Action API test. The migration test's version-timeline helper nevertheless counts those child revisions incorrectly; its narrow correction/regression is part of the #88 follow-up, not a product policy change. Staff actor PersonRef and public cancellation reason are intentionally visible in the approved public workflow contract (BR-22/API section2); Internal Notes/private Action revisions remain excluded. The new timeline UI surfaces that approved data, rather than claiming cancellation reasons already appeared in the earlier detail layout. The redundant publicComment branch can be removed after schema validation; a separate identical pagination schema is optional naming, with no behavior/validation difference required.

The reviewer also requested CI results if Checks remains0. Existing logs are complete local runs and remain linked; they are not CI. No configured CI result is claimed. This quality follow-up remains explicit for later verification/release work rather than being silently marked satisfied by local output.

### Issue #88 implementation, review and evidence

AI review led to precise untouched timestamps, monotonic server-clock validation, frozen form versions, explicit conflict review, off-page linked Action refresh, generation tokens across route/auth transitions, busy-editor guards, read-only preserved drafts and reliable field/deep-link focus. Tests preserve historical ineligible assignee labels and demonstrate permitted descriptive edits; unchanged inactive assignee IDs were already accepted by the API, so no false backend rejection fix is claimed. The old Requester assertion forbidding an Actions tab was replaced for the intentional read-only feature; inherited ownership/finality assertions remain.

PR97 follow-ups are now concrete: the shared timeline helper excludes child TICKET_CANCEL revisions from parent increments, a real two-child case checks it and migration seed callers still explicitly require CREATED. The unreachable non-Waiting publicComment branch is removed with its rejection assertion retained. Requester public actor/cancellation data remains the approved public projection. Workflow pagination continues sharing identical validated page semantics; no duplicate schema was added solely for naming. CI remains a quality follow-up, not a fabricated result.

Source `60e9d9d0715af270eeb3b2422c9d54b7e02f017a` passed client185/server236, both builds, new Actions browser1 and inherited Staff/attachment browser2. AI Reviewer independently passed31client tests, then repeated the real browser journey. Its first attempt timed out waiting for parent refresh; one unchanged repeat passed1test/11.6s. Both outputs and the limitation remain in [complete evidence](../../artifacts/lab-04/verification/issue88/README.md); no timeout increase, erased failure or CI/human approval claim is used. Exact-source confirmation found no remaining actionable source/visual issue.

Root and AI Reviewer inspected [three-size Actions and state captures](../../artifacts/lab-04/screenshots/actions-taken/README.md), including corrected identity/conflict framing. Real browser assertions verify separate assignee/performer,409 draft/review retry,503 exact retry, keyboard tab selection, disabled Zen-green color and responsive geometry. This is scoped visual/automated accessibility evidence; full human/increased-text/whole-app and final-main checks remain pending.

### PR #98 human approval and integration

[Sxr1n's approval](https://github.com/FramePongrit/toktickit/pull/98#pullrequestreview-5696946340) covers `93c108e0a1c1cd7bf2240e5c3fb2fe5e2f907830`, October29 at18:29:24 Asia/Bangkok. PR98 merged at18:32:30 as `6b1277d5e0335f5e8013cd1cc60248c6eeafc668`; Issue88 closed at18:41:06 and card Done. The review found no blocker and explicitly accepted recorded timeout evidence; earlier pending-review wording is historical.

Three narrow follow-ups accompany #89: client-side Result validation for Completed corrections (Cancelled remains optional), readable names from already-authorized identity data with an honest unknown-ID fallback, and audit pagination that fetches only its own history. No additional User lookup/privacy surface is authorized. The suggested large ActionsTakenPanel split is acknowledged as a later maintenance/refactor candidate, not a new feature or an inferred release blocker; broad restructuring is outside this API increment. CI evidence remains explicitly local-only. The approved engineering contract defines #89 backend then #90 UI and later verification/docs/release; final release scope/readiness must be assessed before release rather than pretending remaining work is complete.

## 3. Contract-authoring inspection (historical snapshot before publication)

| Check | Evidence/result |
|---|---|
| Baseline | Remote main fetched and local contract branch based on released Lab 3 SHA above; unrelated dirty Lab 3 checkout preserved |
| Required document set | specification.md, api-spec.md, ui-spec.md, tests.md, issue-plan.md, reviewer.md |
| Stakeholder policies / handout ambiguity | Action work-item lifecycle, separate actors/times, corrections/audit, own-Ticket visibility, cycle-based gate, legacy preservation and role metrics explicitly documented |
| Traceability | Authoring inspection passed: 15 unique FR, 42 unique BR, 24 unique AC; all map to trace rows and every AC has planned tests; 45 unique test entries and 10 local Issue definitions |
| Relative links and current Git diff | All local Markdown file links resolve, fences balanced, no trailing whitespace; six new docs only under docs/lab-04; HEAD remains the released Lab 3 baseline on the contract branch |
| Application tests/builds | Not run for documentation-only authoring |
| Required future product files/screenshots/ai-use.md | Clearly marked planned; not fabricated as existing |

Read-only AI factual audits checked all six documents against the handout, approved interview and existing code. Coverage audit found no missing mandatory scope or AC-to-test gap. Before final handoff the author corrected the exact statusCounts object shape, preserved Lab 3 USER_INACTIVE semantics, defined a submitted-payload digest before dynamic defaults, serialized concurrent request-key replay before stale-state checks, and specified unchanged-priority no-op behavior. These are documentation corrections within the approved policy, not human peer approvals or executed product tests.

## 4. Execution evidence template

Append an entry per real run with timestamp/time zone, code commit/branch, isolated environment, exact command, pass/fail/skip counts and log/artifact path. Record sensitive configuration only by safe environment label, not credentials or full DATABASE_URL.

| Timestamp / commit | Command / suite | Isolated environment | Passed / failed / skipped | Evidence path | Defect / disposition |
|---|---|---|---|---|---|
| 2026-10-25 / working source committed unchanged as 9b29487 | npm --prefix server test | Dedicated PostgreSQL16 localhost55434/lab4test; base migrated through all 8 migrations | 206 / 0 / 0; 19 files | [Full output](../../artifacts/lab-04/verification/full-server.txt) | PR95 correction passes; includes21security/5Windowsrunbook |
| 2026-10-25 / same source as 9b29487 | npm --prefix server run test:migration | Same dedicated environment; random owned schemas/DBs | 12 / 0 / 0; 4 files | [Complete output](../../artifacts/lab-04/verification/migration-recovery-runbook.txt) | Fresh, published-Lab4 correction, FK23503, recovery and runbook pass |
| 2026-10-25 22:59:35 start / 9b29487 | Independent AI Reviewer: npm --prefix server run test:migration | Same dedicated environment; newly generated owned fixtures | 12 / 0 / 0; 4 files;103.31s | [Reviewer output](../../artifacts/lab-04/verification/reviewer-migration-recovery.txt) | No remaining actionable findings |
| 2026-10-25 / same source as 9b29487 | Prisma validate/generate; server build; diff/migration-integrity checks | Current checkout; dedicated test configuration | Exit0 | [Prisma/build](../../artifacts/lab-04/verification/prisma-build.txt), [integrity](../../artifacts/lab-04/verification/diff-integrity.txt) | Original migration unchanged; correction additive/atomic |
| 2026-10-24 Asia/Bangkok / 6be4a1a | npm --prefix server test | PostgreSQL16 loopback55434, lab4test, task-owned base schema | 200 / 0 / 0; 18 files | [tests.md section10](tests.md#10-issue-85-first-implementation-verification) | #85 scope passes |
| 2026-10-24 Asia/Bangkok / 6be4a1a | npm --prefix server run test:migration | Same dedicated container; random schemas/databases | 6 / 0 / 0; 3 files | tests.md section10 | Fresh/upgrade/seed/constraints/real restored-app smoke pass |
| 2026-10-24 17:22:32 Asia/Bangkok start / same product source as 6be4a1a | Independent AI Reviewer: npm --prefix server run test:migration | Same dedicated container; new task-owned schemas/databases | 6 / 0 / 0; 3 files; 92.51s | tests.md section10; working AI log | Confirmed after sandbox-only denial retried elevated |
| 2026-10-24 Asia/Bangkok / 6be4a1a | npm --prefix server run test:security | Same dedicated environment | 21 / 0 / 0; 1 file | tests.md section10 | Pass |
| 2026-10-24 Asia/Bangkok / 6be4a1a | Prisma validate/generate; server build | Current checkout; explicit test DATABASE_URL | Passed | tests.md section10 | No executable change after verification |
| 2026-10-24 Asia/Bangkok / PR #95 | README PowerShell parsing and Windows containment assertions; git diff --check | Read-only syntax/assertions | Passed; 2 blocks and 4 path cases | tests.md section10 | Final runbook fixes verified |
| Pending | Complete server/client/security/migration/build/E2E suite | Pending | Not run | Pending | Pending |
| Pending | Performance 1000 Tickets / 5000 Actions | Pending | Not measured | Pending | Pending |
| Pending | Backup/isolated restore and attachment verification | Pending | Not run | Pending | Pending |
| Pending | Three-viewport screenshot and keyboard inspection | Pending | Not inspected | Pending | Pending |

For selected Dashboard metrics, record independent DB queries with redacted fixture actor ids/time bounds, result and corresponding API/card evidence. Include both positive and zero examples. Do not confuse requestedPriority with itPriority or assigned Actions with performed Actions.

## 5. Release and PDF readiness

- [ ] Every feature PR is reviewed into lab4-staging; Issue/Project states truthful and all required work Done.
- [ ] No unresolved review thread, failed/disabled/skipped/flaky required test or unchecked product DoD remains.
- [ ] Fresh/upgrade/seed/recovery and complete earlier/new suites/builds executed with recorded code SHA and safe logs.
- [ ] Release PR, review approval, merge commit and final main verification recorded.
- [ ] README setup/migration/seed/test/demo/recovery and .gitignore/tracked-file evidence current.
- [ ] UI visual/accessibility checklist actually inspected and screenshots readable at three required sizes.
- [ ] Curated docs/lab-04/ai-use.md later prepared from staging with 6-10 prompts, actual LLM(s), and student's own My Reflection.
- [ ] One PDF contains exact Answer Part 1 through Answer Part 9 headings, all 60-point evidence and working links.
- [ ] Final-main repository remains source of truth; actual submission cutoff checked; PDF submitted by October 29, 2026.

Current state: none of these future release/completion boxes is claimed complete by the documentation authoring task.

## 6. Issue #89 / PR #99 implementation review

October29,2026, Asia/Bangkok. [PR99](https://github.com/FramePongrit/toktickit/pull/99) merged into lab4-staging as `171d8bc4d3022a5e67161983fb23fcac82f50da7` at 23:53:41 Bangkok. Sxr1n approved with a requested Staff Queue search correction, carried into #90. Source `6f08f4e5e1a7ccaf5d53d3240d7cc28d7dc65495` had no remaining actionable AI review findings. [Complete evidence](../../artifacts/lab-04/verification/issue89/README.md) records server247/client196/browser3/builds, guarded1000Ticket/5000Action performance and independentSQL. Reviewer independently passed API/rules11tests11.10s and PERF1test9.53s, maxp9578.62ms, and verified cleanup by directpsql. These are local checks, not CI or human approval.

Review fixed concrete issues before handoff: Dashboard Action UI hrefs, nullable Staff resolvedAt projection, shared count/list predicates, exact date-boundary assertions, PERF owned-row cleanup/target restrictions/opt-in discovery/content/query checks, list URL/pageSize/back-forward synchronization, mutually exclusive filters and impossible-calendar-date rejection. Strict400 unknown requesterId-query tests retain independent ownership checks. Narrow PR98 follow-ups now validate Completed correction Result, paginate history independently and display safe known names with ID fallback. The larger Actions panel refactor remains deferred maintenance.

The first manual-server combined browser run had one attachmentPOST500; canonical Staff2/2 and combined3/3 later passed without a product fix. Its cause remains unconfirmed. Diagnostic pre-browser stalls, temporary instrumentation removal and exact fixture cleanup are recorded; do not describe that failure as explained. Fullcourse E2E/final-main/CI/release/PDF and DashboardUI remain later work.

## 7. Issue #90 / PR #100 implementation review

October 30, 2026, Bangkok time. [PR #100](https://github.com/FramePongrit/toktickit/pull/100), source `5236ef59aa25be02ae578087449dfc07e35e4aea`, awaits human review. Independent AI Reviewer confirmed exact source, no actionable findings, and six client files / 62 tests passed. [Evidence](../../artifacts/lab-04/verification/issue90/README.md) includes final client 219 tests, Dashboard browser 1 test, inherited authentication/Staff/Admin browser 7 tests, build and actual three-viewport screenshots. Review findings corrected request cancellation and identity isolation, URL validation and navigation, stale Action labels, empty-page pagination, Bangkok period labels and the PR99 Staff search defect.

An earlier parallel client run was reported to have eight failures; its raw log and test names are unavailable. A later, separate default-parallel investigation failed five of 219 tests while unchanged two-worker and serial runs passed all 219. The comparison indicates execution sensitivity but does not establish the earlier failures' cause. Full outputs are in the evidence index. Earlier browser startup/locator failures remain recorded. Visual inspection of eight screenshots is scoped and is not a full manual screen-reader audit; final-main and release checks remain pending.

### PR #100 human feedback and correction

Sxr1n's [review](https://github.com/FramePongrit/toktickit/pull/100#pullrequestreview-5707592002) was commented, not an approval. Source correction `90b6ec4d2285164cd27a181b88be95c5d28ef6a9` adds client CI with a two-worker default and uploaded run logs; fixes isolated Dashboard E2E discovery and screenshot paths; adds explicit Staff/Admin landings, fixed metric expectations, Queue search feedback and session-aware auth-failure handling. The separate opt-in `dashboard-screenshots` project is an intentional alternative to moving captures into the existing Lab2/3 screenshots project, retaining the older project's selection. Existing historical logs remain as provenance; new CI logs are uploaded as artifacts.

Local verification includes 228 client tests, build, Dashboard lifecycle 4/4, capture 1/1, inherited browser 7/7, and independent Reviewer 71 tests. The first inherited run used an incorrectly seeded third Admin, making both deactivations valid; the unseeded guarded rerun passed and the Admin test now asserts its exact pair before and one remaining afterward. [CI run on correction source](https://github.com/FramePongrit/toktickit/actions/runs/41019937070) passed and uploaded logs; see the [evidence index](../../artifacts/lab-04/verification/issue90/README.md) for failures, cleanup and current-head checks. Human re-review/approval remains pending.

### October 31 follow-up

Sxr1n's [follow-up review](https://github.com/FramePongrit/toktickit/pull/100#pullrequestreview-5722037793) requested a correct Staff mobile navigation screenshot pair, clearer debounce-test limits and a precise pre-staging server/E2E plan with less duplicate CI. Source `0a85c992e529ffdd955d69016150176d693821f5` adds fake-timer debounce coverage, restricts push CI to main and lab4-staging while retaining all PR checks, and makes capture explicitly close/open mobile navigation. The AI Reviewer and orchestrator inspected both corrected images. Former timeout causes, including the eight original failures with no raw log, remain unproven.

The local pre-staging gate uses the dedicated PostgreSQL test container and task-owned schemas: full server tests and build, client tests/build, migration/recovery, and relevant isolated Auth/Staff/Admin and Dashboard E2E. The [evidence index](../../artifacts/lab-04/verification/issue90/README.md#october-31-follow-up-review) records actual command results and earlier failed attempts; client-only GitHub CI does not substitute for server/E2E execution. Broader CI and final-main regression remain Issue #91/release work. Human re-review and approval remain pending.

Sxr1n's [subsequent review](https://github.com/FramePongrit/toktickit/pull/100#pullrequestreview-5722166005) asks for the current-head CI link and notes remaining real timers in Queue tests. The [known limitation](../../artifacts/lab-04/verification/issue90/README.md#october-31-follow-up-review) now explicitly states that several tests still wait for the real 300 ms debounce with a 1500 ms `waitFor` maximum, and the two-worker cap does not establish the original failures' cause. Current-head client CI is linked from the PR description. The feedback described this as non-blocking; human approval remains pending.
