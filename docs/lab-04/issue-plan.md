# Lab 4 Issue and Delivery Plan

Stakeholder-approved scope and schedule, authored 2026-10-23. Final deadline **2026-10-29 Asia/Bangkok**; integrated product, peer review, release and final-main evidence target October 28. Source: [engineering specification](specification.md), [tests](tests.md), [UI](ui-spec.md), [API](api-spec.md). L4-xx identifiers are stable local plan IDs; real published Issue links are recorded in section 6. PR and execution status must be checked on GitHub and in the execution ledger.

## 1. Baseline and branch flow

Released Lab 3 main = 1a20e3465922a2c1dacc5a9eb18e55b0840284b8, [PR 83](https://github.com/FramePongrit/toktickit/pull/83). Its content matches the approved Lab 3 staging release; older local cached main was outdated and was refreshed before authoring. Preserve other dirty Lab 3 checkouts.

Local preparation: lab4-staging was created at origin/main; feature/lab4-engineering-contract was created from it. No direct development on main or lab4-staging. Contract files remain reviewable working changes until committed/reviewed through the normal course workflow. Local lab4-staging initially points to the main baseline; once the remote Lab 4 integration branch exists, set its upstream to origin/lab4-staging rather than accidentally pulling future main into it.

Required flow:

~~~text
main (released Lab 3)
  -> lab4-staging
      -> feature/lab4-engineering-contract -> reviewed PR into lab4-staging
      -> one feature branch per implementation Issue -> reviewed PRs into lab4-staging
  <- one reviewed release PR from lab4-staging after integrated verification
~~~

Before coding: publish the contract/implementation Issues and map plan IDs to real links, put them on the GitHub Project and review dependencies. Use Backlog -> Specified -> Started -> PR Review -> Fixing -> Done truthfully. A specification can be stakeholder-approved while peer review is pending. Do not invent reviewer identities/approvals, mark Issues Done before evidence exists, or treat an AI review as a human peer approval.

## 2. Dated milestones and dependencies

| Date (Oct 2026) | Milestone / plan IDs | Exit evidence |
|---|---|---|
| 23 | L4-01 contract/test/Issue plan | Reviewed internally consistent contract ready before feature PR completion |
| 24 | L4-02 data/recovery and L4-03 Actions API foundation | Fresh/upgrade/seed/recovery evidence; first Action API tests |
| 25 | L4-03 completion, L4-04 workflow and L4-05 Actions UI | Action/cycle/gate/cancellation journeys and audit UI |
| 26 | L4-06 Dashboard APIs/filters and L4-07 Dashboard UI | Correct SQL-matched counts, own-only metrics and drill-down |
| 27 | L4-08 integrated quality | Complete regression/E2E/accessibility/visual/performance checks |
| 28 | L4-09 evidence and L4-10 release | Peer review/fixes resolved, release merged and final-main checks/evidence |
| 29 | Submission assembly/audit under L4-10 | One readable PDF, Answer Parts 1-9, links/screenshots checked, actual submission |

Dependencies: 01 -> 02 -> 03 -> 04; 03+04 -> 05; 03+04 -> 06 -> 07; 05+07 -> 08 -> 09 -> 10. Within a date respect these dependencies rather than treating every row as parallel-ready. Review each PR continuously, not only on October 28. A blocker becomes an explicit linked task; do not silently reduce approved scope or claim a date proves completion. No cutoff time-of-day was supplied; check the course submission cutoff before delivery.

## 3. Ready-to-file Issue definitions

### L4-01 - Sprint 4 engineering contract and test plan

Branch: feature/lab4-engineering-contract. Depends on: released Lab 3. Target: October 23. GitHub Issue: #84; [PR #94](https://github.com/FramePongrit/toktickit/pull/94) open into lab4-staging, human review/merge pending.

Tasks: maintain the six Lab 4 contract/review-plan files; resolve handout ambiguities through the recorded stakeholder interview; specify numbered FR/BR/AC, exact roles/matrices/fields/API/UI/data/recovery; map every AC to planned tests; record approval provenance before feature implementation. Prepare real Project/Issue mapping and peer-review request after the reviewable document set exists.

Acceptance: all FR-01-15, BR-01-42 and AC-01-24 represented consistently; test targets are explicitly planned rather than fabricated results; language English; final date October 29; working AI capture stays in the requested external staging file. Peer review and later curated ai-use.md are truthfully pending.

Verification: read/compare all six files and handout; audit links/IDs/traceability and current Git baseline. No application test execution needed for documentation-only authoring. Contract provenance contributes to AC-24 and Answer Part 2.

### L4-02 - Additive Action/workflow schema, seed and recovery

Branch: feature/lab4-data-migration. Depends on: L4-01. Target: October 24.

Tasks: implement logical schema/constraints/indexes in specification section 7; add current-cycle/version/resolvedAt defaults; create typed baseline snapshots without fabricated Actions/time; keep existing credentials/ids/relations/attachment data. Extend scoped seed for all demonstrations and zero metrics. Add backup/restore procedure and test-owned migration/recovery fixtures. Extend vitest.migration.config.ts includes deliberately; preserve older migration runs.

Acceptance: AC-18/19, BR-38-41; fresh and Lab 3 upgrade paths; seed twice preserves changes; restore reproduces DB/file inventory in isolated destination. Already-Resolved legacy close and future current-cycle gate cases are testable. Add at least two schema-decision justifications to the contract if implementation changes their details.

Tests: MIG-01/02/03, initial field/constraint fixtures. Outputs: SQL migration, updated Prisma/seed, migration/recovery test paths and README recovery instructions. No destructive reset/down migration or invented timestamps.

### L4-03 - Collaborative Actions API, audit, versions and retry safety

Branch: feature/lab4-actions-api. Depends on: L4-02. Target: October 24-25.

Tasks: implement new Action read/create/edit/transition/history APIs, safe PersonRefs, current-cycle/parent-state guards, defaults/validation and actual completer attribution. Reuse eligible-owner directory for assignees. Add revision snapshots and expected versions under existing User/parent locks. Implement transactionally persisted idempotency for creates/transitions, replay auth and conflict errors. Update operational Staff write versions and all corresponding callers/fixtures coherently.

Acceptance: AC-01-07,12,13; Requester can read all own-Ticket Actions but never write/read revisions; direct cross-owner/cross-Ticket calls are safe; inactive/demoted assignee handling and terminal corrections match the contract; no duplicate/audit/lost-update effects.

Tests: UNIT-01/03/06, API-A01-07, API-C01/02, API-I01; no placeholder tests that merely mirror constants. Extend global finality race integration where this Issue adds writes.

### L4-04 - Ticket resolution gate, work cycles and atomic cancellation

Branch: feature/lab4-ticket-workflow. Depends on: L4-03. Target: October 25.

Tasks: preserve the Ticket matrix and Owner prerequisite; implement gate/available transitions/reasons, workflow events, resolvedAt and cycle increments; retain advisory indication and Waiting comment atomicity. Cancel unfinished current-cycle Actions with Ticket transaction and history. Resolve vs edit/final/Admin race behavior must remain valid. Add shared authorized workflow read routes.

Acceptance: AC-08-12 and BR-17-25; cancelled-only work does not satisfy resolution; follow-up and open work block it; reopened cycle needs new completed evidence; old cycles lock; final reads remain; any child/event failure rolls back cancellation.

Tests: UNIT-02, API-W01-05, API-C03 and affected legacy workflow tests updated for explicit version/gate changes. Preserve their original authorization/finality/Owner assertions.

### L4-05 - Actions Taken and workflow UI

Branch: feature/lab4-actions-ui. Depends on: L4-03/04. Target: October 25.

Tasks: add Actions tab, ordered paginated desktop table/mobile cards, inline create/edit/correction forms, assignee directory, actual performer display, start/complete/cancel controls, staff audit and public timeline. Deep Action links fetch/focus the right record across list pages. Add gate/cancellation/reopen explanations and current parent/version refresh. Preserve drafts and retry intent safely; maintain inherited communications/attachments/admin controls.

Acceptance: AC-01-13,20/21 applicable UI; read-only requester/old-cycle/resolved/final modes; text/date/follow-up/reason errors inline; keyboard tabs/focus; no unsupported terminal identity/status changes or new file subsystem.

Tests: UI-03/04/06, initial STYLE-01/02; E2E-01/02 preparation. Keep component/API contracts aligned within the PR.

### L4-06 - Role Dashboard APIs and exact drill-down queries

Branch: feature/lab4-dashboard-api. Depends on: L4-03/04. Target: October 26.

Tasks: backend role-owned snapshots/counts/previews and Bangkok boundaries; all-eight-status counts; assigned vs performed Action semantics; database-limited queries/shared filter predicates. Extend Ticket status/priority sets/date sorting and inline My Actions endpoint. Advance updatedAt for agreed prospective public activity, not Internal Notes/replays; preserve legacy timestamps. Add independent SQL comparisons and query-plan/performance fixtures.

Acceptance: AC-14-17/23; exact zero/non-zero/current-user/ownership metrics and safe payloads; five-row previews; matching filters/ordering/units; old unknown resolution times excluded honestly. Existing valid single filters/defaults remain. No full Ticket collection calculation or Admin optional counters.

Tests: UNIT-04/05, API-D01-04, PERF-01 initial run. At least selected Requester/Staff card values must have recorded independent database query evidence, not just mocked UI numbers.

### L4-07 - Role Dashboard UI, landing and URL-backed navigation

Branch: feature/lab4-dashboard-ui. Depends on: L4-06 (and shared Action rendering from L4-05). Target: October 26.

Tasks: role Dashboard landing/nav, four cards per role, status counts/previews/as-of, refresh/error/zero states, inline paginated My Actions. Implement My Tickets URL parser/serializer and Staff Queue additions with visible active filters, back/forward/refresh and exact Action anchors. Clear scoped caches on logout/identity change; preserve existing direct routes/forced password flow.

Acceptance: AC-14-17,20/21; units and recent periods clear, no forbidden data flashes or fake-zero errors; My Tickets remains the detailed Ticket list; approved desktop/tablet/mobile layout.

Tests: UI-01/02/05, STYLE-01, E2E-03 preparation; keep all earlier component/navigation assertions except specifically changed landing destinations.

### L4-08 - Integrated regression, E2E, accessibility and performance evidence

Branch: feature/lab4-quality-evidence. Depends on: L4-05/07 and underlying APIs/data. Target: October 27.

Tasks: implement all three required core Lab 4 E2E files plus regression/accessibility/capture coverage, isolated runner and Playwright discovery/config updates. Run complete earlier/new server/client/security/migration/browser checks and builds; test controlled concurrency/failures beyond happy paths. Measure agreed 1000/5000 performance fixture and capture SQL/DB comparisons. Inspect major screens at all three viewports, console/network failures and draft preservation.

Acceptance: AC-01-23; all required tests pass with no silent skips, fixture cleanup constrained, screenshots readable/consistent and manual keyboard checklist actual. Fix discovered defects through linked Issues/PRs rather than weakening expected behavior.

Tests: E2E-01-04, STYLE-02, VIS-01, REG-01, PERF-01 and full planned matrix. Outputs: actual test logs/commands/commit/environment and captures under required folders, not invented totals.

### L4-09 - Final documentation, visual inspection and review evidence

Branch: feature/lab4-final-evidence. Depends on: L4-08. Target: October 28.

Tasks: reconcile contract with approved implementation, fill tests.md results and actual paths, update README setup/seed/migration/recovery/test/demo; inspect .gitignore/tracked files; finish visual checklist and reviewer.md using real review identities/comments/responses/approvals/links. Prepare course-required curated ai-use.md later from the external staging record with real LLM naming, 6-10 prompts and the student's own reflection. Keep the full staging capture as requested; redact secrets before any publication.

Acceptance: AC-24 preparation; no fabricated review/test/reflection evidence, missing screenshot, stale Issue/PR status or broken relative document link. Contract changes are explained/approved, not rewritten merely to fit incomplete behavior.

Verification: DOC-01 and full evidence mapping below. Any product-code correction requires relevant checks and integrated re-verification before release.

### L4-10 - Release integration, final-main evidence and one-PDF submission

Branch/PR: release lab4-staging -> main; use a linked follow-up branch/PR for any final evidence-file changes rather than editing main directly. Depends on: L4-01-09 reviewed/complete. Target: product/release October 28; final PDF October 29.

Tasks: verify required features/reviews/tests/docs/seed/recovery/artifacts on integrated staging; open/review the release PR and merge only when exit criteria pass. Check out the resulting main commit and execute the required final-main suite; record that exact code SHA in final evidence. If a later documentation-only evidence commit changes main SHA, prove its diff is documentation-only and reference the tested code tree; any executable/config/fixture change requires appropriate rerun. Use a reviewed follow-up PR for evidence updates. Mark Project Issues Done only after real completion. Assemble exactly one PDF with exact headings and working links, inspect pages at readable zoom, confirm actual course cutoff and submit by October 29.

Acceptance: all product and course DoD boxes satisfied; no unresolved failed/flaky/skipped required check, review thread or missing artifact. Final main/repository is grading source of truth. PDF submission and GitHub release are future tasks, not outputs of contract authoring.

Tests/evidence: REG-01, DOC-01, final builds/migration/recovery/performance/E2E as required by tests.md, plus final PDF visual/link audit.

## 4. One-PDF evidence mapping (60 points)

Use headings exactly Answer Part 1 through Answer Part 9 in that order. Links must work; screenshots readable without extreme zoom. Do not replace required final-main output with old Lab 3 evidence.

| PDF heading | Points | Required evidence / owner Issue |
|---|---|---|
| Answer Part 1 | 10 | Feature -> lab4-staging -> main history; Project Issues Done; rendered reviewer.md with real identity/PR comments/responses/approvals; README/.gitignore/repo structure. L4-01/09/10. |
| Answer Part 2 | 5 | Link/render specification.md: numbered FR/BR, Action/Ticket rules, dashboard math, AC, migration decisions/DoD, proof spec predates completed implementation PRs. L4-01/09. |
| Answer Part 3 | 10 | Link/render tests.md with plans, AC trace, actual paths/final results; complete unit/API/integration/UI/auth/workflow/regression/E2E passing main output. L4-08/10. |
| Answer Part 4 | 5 | Later curated ai-use.md naming actual LLM(s), 6-10 key prompts and student My Reflection about specification/coding agents. Full capture remains staging. L4-09. |
| Answer Part 5 | 5 | Staff operational metrics/current-user Actions/priority or recent Tickets/counts/drilldown/loading/empty/forbidden/failure/responsive; selected independent DB count matches. L4-06/07/08. |
| Answer Part 6 | 10 | Actions list/create/assign/edit/status/complete/cancel, validation/inactive-assignee rejection/roles/failures/responsive and multiple Actions/different staff on one Ticket. L4-03/05/08. |
| Answer Part 7 | 5 | Permitted Ticket transitions, stable ordering, append-only history, role visibility and gate/reopen/cancel behavior. L4-04/05/08. |
| Answer Part 8 | 5 | Requester-owned metrics/recent-attention/drilldown/ownership plus auth/My Tickets/detail/attachments/comments/Staff/Internal Notes/Admin regression. L4-07/08. |
| Answer Part 9 | 5 | Render ui-spec.md, desktop/tablet/mobile major-screen captures and completed visual/accessibility checklist covering field states/validation/focus/clipping/overlap/overflow. L4-05/07/08/09. |

## 5. Handoff rules and current boundary

Coding agent receives specification.md, api-spec.md, ui-spec.md and tests.md together, then implements one dependency-ready Issue with its AC/test scope. It reports changed files, actual tests/results and unmet DoD. If a contradiction is discovered, stop the dependent implementation choice, present a concrete proposed contract amendment and update all companions when approved. Do not broaden scope or mark a feature Done based on appearance/agent assurance.

The initial authoring task created the six contract/plan/review files and maintained the external staging log. On October 24 the stakeholder authorized orchestrated implementation, GitHub Issue/PR publication and Kanban management. Merge/closure remains subject to the stakeholder's instruction. Executor and Reviewer must apply Ponytail full for every assigned round.

## 6. Published work mapping (October 24)

Project: [TokTickIT Individual Sprints](https://github.com/users/FramePongrit/projects/1).

| Plan | GitHub Issue |
|---|---|
| L4-01 | [#84](https://github.com/FramePongrit/toktickit/issues/84) |
| L4-02 | [#85](https://github.com/FramePongrit/toktickit/issues/85) |
| L4-03 | [#86](https://github.com/FramePongrit/toktickit/issues/86) |
| L4-04 | [#87](https://github.com/FramePongrit/toktickit/issues/87) |
| L4-05 | [#88](https://github.com/FramePongrit/toktickit/issues/88) |
| L4-06 | [#89](https://github.com/FramePongrit/toktickit/issues/89) |
| L4-07 | [#90](https://github.com/FramePongrit/toktickit/issues/90) |
| L4-08 | [#91](https://github.com/FramePongrit/toktickit/issues/91) |
| L4-09 | [#92](https://github.com/FramePongrit/toktickit/issues/92) |
| L4-10 | [#93](https://github.com/FramePongrit/toktickit/issues/93) |

Until the contract PR is merged, implementation branches may stack on `feature/lab4-engineering-contract` with that branch as their temporary PR base. After stakeholder-authorized merge of the contract, retarget implementation PRs to `lab4-staging` and recheck their diffs. This preserves separate review scopes without merging either PR automatically.
