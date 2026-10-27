# Lab 4 Peer Review and Evidence Record

Status: **contract and PR #95 peer-reviewed and merged; PR #96 awaiting human review; release pending**. Prepared 2026-10-23; review ledger updated 2026-10-26. This file distinguishes actual events from pending review and test evidence.

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
| L4-03 | [#86](https://github.com/FramePongrit/toktickit/issues/86) | feature/lab4-actions-api / [#96](https://github.com/FramePongrit/toktickit/pull/96) | Human pending; AI Reviewer checked617bd9d | Pagination, session precedence, ownership refresh, ambiguous retry and fixture cleanup fixed; server227/client151/browser2 passed | Human approval/merge pending | PR Review |
| L4-04 | [#87](https://github.com/FramePongrit/toktickit/issues/87) | feature/lab4-ticket-workflow / Pending | Pending | Pending | Pending | Backlog |
| L4-05 | [#88](https://github.com/FramePongrit/toktickit/issues/88) | feature/lab4-actions-ui / Pending | Pending | Pending | Pending | Backlog |
| L4-06 | [#89](https://github.com/FramePongrit/toktickit/issues/89) | feature/lab4-dashboard-api / Pending | Pending | Pending | Pending | Backlog |
| L4-07 | [#90](https://github.com/FramePongrit/toktickit/issues/90) | feature/lab4-dashboard-ui / Pending | Pending | Pending | Pending | Backlog |
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
