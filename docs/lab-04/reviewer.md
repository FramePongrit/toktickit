# Lab 4 Peer Review and Evidence Record

Status: **stakeholder contract approved; first implementation in progress; human peer review and release pending**. Prepared 2026-10-23; publication ledger updated 2026-10-24. This file distinguishes actual events from pending review and test evidence.

Repository: [FramePongrit/toktickit](https://github.com/FramePongrit/toktickit). Baseline: main 1a20e3465922a2c1dacc5a9eb18e55b0840284b8, [Lab 3 release PR 83](https://github.com/FramePongrit/toktickit/pull/83). Integration branch: lab4-staging. Current contract branch: feature/lab4-engineering-contract.

## 1. Contract approval provenance

The user requested batch-grill-me planning, answered six decision rounds and clarification, accepted the consolidated shared-understanding summary, then authorized authoring with **"เริ่มได้เลย"** on 2026-10-23. Approved deadline is October 29, superseding October 30; internal integrated release target is October 28. Documents are English, discussion Thai.

Working capture is the user-requested external D:/Software Engineering/lab4_ai_use_staging.md. It preserves user prompts/inter-agent task prompts and summary agent answers, including prior interview decisions. It is not yet the curated repository ai-use.md. Do not copy an unreviewed entire working log into a public PR; later course evidence uses selected prompts and actual LLM identification/student reflection.

Contract commit 430cda5 was published before the first feature implementation started. [PR #94](https://github.com/FramePongrit/toktickit/pull/94) is open into lab4-staging; human approval and merge timestamps remain pending.

| Item | Current verified state |
|---|---|
| Stakeholder interview and final authoring authorization | Received in current chat, 2026-10-23 |
| Contract Git commit | 430cda5; published before #85 implementation |
| Contract Issue/PR link | [Issue #84](https://github.com/FramePongrit/toktickit/issues/84), [PR #94](https://github.com/FramePongrit/toktickit/pull/94) |
| Peer reviewer identity | Not assigned/verified for Lab 4 |
| Peer approval/comments/responses | Pending; do not copy Lab 3 approvals |
| Implementation test results | Pending; #85 implementation in progress |
| Final main / release PR | Pending |

## 2. Per-Issue review ledger

Plan IDs come from [issue-plan.md](issue-plan.md). Published Issues are linked below. Replace Pending cells only after verified events; human approval is separate from AI review.

| Plan ID | Issue URL | Branch / PR URL | Reviewer identity | Comments / author responses | Approval / merge commit | Project state |
|---|---|---|---|---|---|---|
| L4-01 | [#84](https://github.com/FramePongrit/toktickit/issues/84) | feature/lab4-engineering-contract / [#94](https://github.com/FramePongrit/toktickit/pull/94) | Human pending | AI contract review: publication ledger corrected; no L4-02 policy inconsistency found | Pending | PR Review |
| L4-02 | [#85](https://github.com/FramePongrit/toktickit/issues/85) | feature/lab4-data-migration / Pending | Pending | Implementation in progress | Pending | Started |
| L4-03 | [#86](https://github.com/FramePongrit/toktickit/issues/86) | feature/lab4-actions-api / Pending | Pending | Pending | Pending | Backlog |
| L4-04 | [#87](https://github.com/FramePongrit/toktickit/issues/87) | feature/lab4-ticket-workflow / Pending | Pending | Pending | Pending | Backlog |
| L4-05 | [#88](https://github.com/FramePongrit/toktickit/issues/88) | feature/lab4-actions-ui / Pending | Pending | Pending | Pending | Backlog |
| L4-06 | [#89](https://github.com/FramePongrit/toktickit/issues/89) | feature/lab4-dashboard-api / Pending | Pending | Pending | Pending | Backlog |
| L4-07 | [#90](https://github.com/FramePongrit/toktickit/issues/90) | feature/lab4-dashboard-ui / Pending | Pending | Pending | Pending | Backlog |
| L4-08 | [#91](https://github.com/FramePongrit/toktickit/issues/91) | feature/lab4-quality-evidence / Pending | Pending | Pending | Pending | Backlog |
| L4-09 | [#92](https://github.com/FramePongrit/toktickit/issues/92) | feature/lab4-final-evidence / Pending | Pending | Pending | Pending | Backlog |
| L4-10 | [#93](https://github.com/FramePongrit/toktickit/issues/93) | lab4-staging -> main / Pending | Pending | Pending | Pending | Backlog |

For each PR, record review-comment permalinks, author's response/fix links, actual submitted approval identity/time and resolved threads. If an AI factual audit assists drafting, label it as such; it is not a peer approval or proof the product works.

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
