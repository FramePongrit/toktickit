# Lab 4 Test Plan and Results

Status: planning contract, 2026-10-23. All checks below are **Planned / Not run**. Product test files listed as targets do not yet exist in this documentation-only increment. Do not infer passing implementation from this plan. Authority: [specification](specification.md), [API](api-spec.md), [UI](ui-spec.md).

## 1. Strategy, TDD and isolation

Create failing tests from the approved AC before implementing the relevant rule, then implement/refactor with the approved tests. Keep real unit/API/component/browser assertions; avoid tests that merely repeat production constants or mock away authorization/transactions. Maintain full earlier assertion coverage while updating only expressly changed Lab 4 contracts (Staff write versions, Dashboard landing, gate/history).

Use existing Vitest/Supertest/Testing Library/Playwright and isolated-schema patterns. Server suites remain serial unless a test deliberately controls concurrency with barriers. Real PostgreSQL row locks/transactions are required for race evidence; no arbitrary sleeps as synchronization. Do not point migration/recovery/performance suites at a shared or production schema. Validate and clean only task-created schema/file paths; do not reset fixed Lab 1 reference ids, alter changed credentials, kill unrelated processes or dump secret configuration.

Use deterministic clock injection for Bangkok boundary cases, independent monotonic duration measurement for performance, distinct Requesters and Staff, safe synthetic data and test-owned attachment bytes. Include authorized success, wrong-role/direct API/cross-owner, invalid/boundary, zero/no-results, failures, conflict and retry cases. Every expected failure checks absence of partial writes/audits/files and unchanged versions.

## 2. Planned-test table

Target files are implementation obligations, not links to nonexistent current files. The expected result column is an assertion, not an execution result.

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file / manual record | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-04 | Action transition matrix, all absent edges and terminal states | Only approved edges accepted | server/tests/lab-04/action-rules.unit.test.ts | Planned / Not run |
| UNIT-02 | Unit | AC-08, AC-09, AC-10 | Ticket matrix, current-cycle gate and reopened-cycle predicates | Owner/completed/unfinished/follow-up rules evaluated without legacy false evidence | server/tests/lab-04/ticket-rules.unit.test.ts | Planned / Not run |
| UNIT-03 | Unit | AC-05, AC-06 | Trim/null, all text limits, effective PATCH values, UTC date bounds and terminal immutable fields | Exact boundary success and invalid/blank/future/pre-Ticket rejection | server/tests/lab-04/action-rules.unit.test.ts | Planned / Not run |
| UNIT-04 | Unit | AC-14, AC-15, AC-16 | Bangkok midnight/start-through inclusivity, year/month rollover and null resolvedAt | Seven calendar days with inclusive snapshot bounds and no inferred dates | server/tests/lab-04/dashboard-rules.unit.test.ts | Planned / Not run |
| UNIT-05 | Unit | AC-06, AC-16 | Stable sort ties and query/URL predicate round trips including status/priority sets | No lost filter, mismatched unit or reorder after actionAt correction | server/tests/lab-04/dashboard-rules.unit.test.ts | Planned / Not run |
| UNIT-06 | Unit | AC-13 | Canonical request digest and user/method/path/key scoping | JSON ordering equivalent; changed values/versions conflict; auth headers never stored | server/tests/lab-04/idempotency.unit.test.ts | Planned / Not run |
| API-A01 | API | AC-01, AC-03 | Create defaults/explicit eligible assignee, non-owner Staff/Admin collaboration | 201 PLANNED with correct parent/cycle/creator and exactly one revision | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-A02 | Authorization | AC-02 | Requester own/all-cycle reads, forbidden writes/history, cross-owner and cross-Ticket ids | No revision/private/foreign data; uniform 404 and direct Staff-role denial | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-A03 | API | AC-05 | Every text/date boundary, default/null/empty behavior, XSS text and effective follow-up/result validation | 400 details; escaped presentation; no partial row/audit/version change | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-A04 | API | AC-03, AC-06 | Unfinished edits/reassign, terminal correction reasons/immutability, inactive or demoted target | Valid audited updates; no false performer or terminal reassignment | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-A05 | API | AC-04, AC-05 | Every Action edge, direct Planned completion, result/follow-up, performer different from assignee, cancel reason | Correct terminal actor/time and required fields; absent edges rejected | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-A06 | API | AC-07, AC-10 | Fresh Action writes on RESOLVED/final/earlier cycle, including malformed business bodies | Correct read-only/final conflict before field validation; reads still work | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-A07 | API | AC-06 | Revision snapshots/reasons/sequence, append-only/no delete routes, ordering after occurrence-time edits | Accurate old/new values; current rows ordered createdAt/id; immutable audit | server/tests/lab-04/actions-taken.api.test.ts | Planned / Not run |
| API-W01 | API | AC-08 | Every Ticket edge, missing/ineligible Owner, Waiting comment atomicity, advisory indication | Approved edges only; public comment/event/status commit together | server/tests/lab-04/ticket-workflow.api.test.ts | Planned / Not run |
| API-W02 | API | AC-09 | No completed evidence, cancelled-only work, unfinished work, outstanding Completed follow-up, cleared follow-up | All blocker combinations rejected; valid current-cycle evidence resolves | server/tests/lab-04/ticket-workflow.api.test.ts | Planned / Not run |
| API-W03 | API | AC-10 | Resolve/reopen twice, old Actions read-only, indication/resolvedAt reset and fresh evidence | Exactly one new cycle per successful reopen; old work cannot satisfy new cycle | server/tests/lab-04/ticket-workflow.api.test.ts | Planned / Not run |
| API-W04 | Integration | AC-11 | Ticket cancellation with many unfinished Actions and injected revision/event write failure | All cancellations/actors/reasons/versions atomically commit or roll back | server/tests/lab-04/ticket-workflow.api.test.ts | Planned / Not run |
| API-W05 | API | AC-07, AC-08, AC-18 | Public timeline stable ties, BASELINE vs TRANSITION and authorized final reads | No invented historical transition, Internal Note or private Action audit | server/tests/lab-04/ticket-workflow.api.test.ts | Planned / Not run |
| API-C01 | Interleaving | AC-12 | Two readers edit same Action or operational Ticket with old versions; same-value priority with current/stale version | One success/one safe 409; no overwrite; valid priority no-op 200 leaves versions/timestamps unchanged; stale no-op conflicts | server/tests/lab-04/concurrency.api.test.ts | Planned / Not run |
| API-C02 | Interleaving | AC-03, AC-12, AC-22 | Start/complete/reassign races with assignee deactivation/demotion and Owner/Admin changes | Eligible committed state only; history identities retained; old Admin safety intact | server/tests/lab-04/concurrency.api.test.ts | Planned / Not run |
| API-C03 | Interleaving | AC-07, AC-11, AC-12, AC-22 | Resolve/cancel/close against Action writes and every earlier Ticket-dependent mutation | No post-read-only/final mutation or half-written file/history | server/tests/lab-04/concurrency.api.test.ts | Planned / Not run |
| API-I01 | Integration | AC-13 | Sequential/concurrent identical create and Action/Ticket transition keys; omitted server-time defaults; wait/recheck before stale checks; failed transaction retry; changed body; logout/role-change replay | One effect/event/revision, original success replay even after waiting or omitted actionAt, changed-key-payload 409, unauthorized replay denied | server/tests/lab-04/idempotency.api.test.ts | Planned / Not run |
| API-D01 | API | AC-14 | Requester cards/previews for two owners at fixed Bangkok boundaries, zero data and unknown legacy dates | Exact DB counts, <=5 safe rows, own-only data, null dates excluded | server/tests/lab-04/requester-dashboard.api.test.ts | Planned / Not run |
| API-D02 | API | AC-15 | Staff/Admin cards, all-eight statusCounts keys with {value,unit,href}, priority ordering, my assigned vs my performed Actions and old cycles | Correct units/counts/sum of value fields/current-user meanings and links; safe summaries only | server/tests/lab-04/staff-dashboard.api.test.ts | Planned / Not run |
| API-D03 | API | AC-16 | Follow every href and compare card count/predicate/order with detailed list at unchanged snapshot; invalid sets/dates/queries | Exact matches including active/all scopes; valid URL and no unauthorized filter override | server/tests/lab-04/dashboard-drilldown.api.test.ts | Planned / Not run |
| API-D04 | API | AC-17 | Ticket metadata/Actions/Public Comments/indication/attachments update updatedAt; Internal Notes/rejects/replays do not | Prospective activity rules without rewriting legacy timestamps | server/tests/lab-04/dashboard-drilldown.api.test.ts | Planned / Not run |
| MIG-01 | Migration | AC-18 | Fresh install and Lab3 upgrade inventory ids/relations/statuses/credentials/files, baseline events and legacy zero-Action cases | All legacy values preserved; no invented Actions/resolution dates; new gate works prospectively | server/tests/lab-04/migration.regression.test.ts | Planned / Not run |
| MIG-02 | Migration | AC-18 | Seed twice with changed credentials and existing user work, all statuses/priorities/cycles/actors/zero metrics | Idempotent fixture counts and unchanged non-fixture work/credentials | server/tests/lab-04/migration.regression.test.ts | Planned / Not run |
| MIG-03 | Recovery | AC-19 | Backup DB plus fixture attachment bytes, restore to isolated destination, compare inventory/hashes, protect source | Matching recovered data/files, documented procedure, no shared-schema/process damage | server/tests/lab-04/recovery.integration.test.ts | Planned / Not run |
| UI-01 | Component | AC-15, AC-16, AC-21 | Staff/Admin cards/units/statusCounts {value,unit,href}/My Actions inline paging/refresh, empty/forbidden/API failure | Correct status values/links, role-safe navigation and distinct feedback; failed refresh not fake zero | client/tests/lab-04/StaffDashboard.test.tsx | Planned / Not run |
| UI-02 | Component | AC-14, AC-16, AC-21 | Requester cards/previews/date labels/links/as-of, invalid URL and cache isolation | Own-only display, preserved filters, zero vs failure distinct | client/tests/lab-04/RequesterDashboard.test.tsx | Planned / Not run |
| UI-03 | Component | AC-01, AC-03, AC-04, AC-05, AC-06, AC-07, AC-21 | Actions view/create/edit/correction/start/complete/cancel, inactive assignee, history permission and read-only cycles | Required labels/validation and immutable fields, correct save feedback/focus | client/tests/lab-04/ActionsTaken.test.tsx | Planned / Not run |
| UI-04 | Component | AC-08, AC-09, AC-10, AC-11, AC-21 | Ticket gate explanations, Waiting/cancel reasons, reopen/new cycle and success summary refresh | Only allowed transitions; blocked reasons and updated status/version visible | client/tests/lab-04/TicketWorkflow.test.tsx | Planned / Not run |
| UI-05 | Component | AC-16, AC-20, AC-22 | Role landing/nav/auth restore/first password/direct URL, back/forward/query state | Existing routes survive with permitted Dashboard landing and no identity cache leak | client/tests/lab-04/Navigation.test.tsx | Planned / Not run |
| UI-06 | Component | AC-12, AC-13, AC-21 | Stale forms, recovery failure, duplicate clicks, unknown-network retry key/body, edited retry new key | Draft preserved, explicit reload/review, no automatic overwrite/duplicate | client/tests/lab-04/ActionsTaken.test.tsx | Planned / Not run |
| STYLE-01 | UI style | AC-20 | Zen tokens/readonly/required/error/busy/disabled/status semantics and responsive variants | Consistent DOM/CSS states; no hidden duplicate content | client/tests/lab-04/UiStyle.test.tsx | Planned / Not run |
| STYLE-02 | Accessibility | AC-20, AC-21 | Tabs, labels, keyboard/focus/return focus/live regions/non-color status | Accessible create/edit/correction/audit and Dashboard links in browser plus manual check | e2e/lab-04/accessibility.spec.ts | Planned / Not run |
| E2E-01 | E2E | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-12, AC-13 | Two Staff collaborate on one Ticket with different assignee/performer, requester read and conflicts/retry | Real browser/API/DB journey meets Action acceptance rules | e2e/lab-04/actions-taken-flow.spec.ts | Planned / Not run |
| E2E-02 | E2E | AC-08, AC-09, AC-10, AC-11 | Create through gate/follow-up/resolve/reopen/new work/close plus separate cancellation scenario | Complete lifecycle with immutable history and atomic cancellation | e2e/lab-04/ticket-resolution.spec.ts | Planned / Not run |
| E2E-03 | E2E | AC-14, AC-15, AC-16, AC-17 | Both Dashboards and Admin reuse, exact drilldowns, My Actions paging and refresh after work | Correct real-data metrics/units/filters/updates and ownership protection | e2e/lab-04/dashboards.spec.ts | Planned / Not run |
| E2E-04 | Regression | AC-22 | Auth/first password/logout, My Tickets/detail, attachments, public/internal communication, Staff/Admin representative workflows | Earlier journeys preserved with explicitly updated operational version payloads | e2e/lab-04/regression.spec.ts | Planned / Not run |
| VIS-01 | Responsive/visual | AC-20 | Major Lab4 screens and modes at 1440x900,820x1024,390x844 plus horizontal overflow geometry | Readable screenshots and completed human visual checklist | e2e/lab-04/capture.screens.ts | Planned / Not run |
| REG-01 | Full regression | AC-22 | All earlier server/client/API/auth/security/migration/browser suites and new suites together | All required tests pass, zero required skips, recorded final-main SHA | docs/lab-04/reviewer.md (execution record; existing suite paths retained) | Planned / Not run |
| PERF-01 | Performance smoke | AC-23 | 1000 Tickets/5000 Actions, Dashboard and matching drilldown queries, warmup and 20 measured calls each | Per-endpoint p95 <=2000ms; exact data cardinality/environment/query evidence recorded | server/tests/lab-04/dashboard.performance.test.ts | Planned / Not run |
| DOC-01 | Manual evidence audit | AC-24 | AC/FR/BR trace, actual test paths/results, review links, directory/README/gitignore and Answer Parts1-9 | Complete truthful final-main evidence; no placeholder approval or invented result | docs/lab-04/reviewer.md | Planned / Not run |

## 3. Acceptance-criterion traceability

| AC | Planned test IDs | Final evidence |
|---|---|---|
| AC-01 | API-A01, UI-03, E2E-01 | Pending execution on final main |
| AC-02 | API-A02, E2E-01 | Pending execution on final main |
| AC-03 | API-A01, API-A04, API-C02, UI-03, E2E-01 | Pending execution on final main |
| AC-04 | UNIT-01, API-A05, UI-03, E2E-01 | Pending execution on final main |
| AC-05 | UNIT-03, API-A03, API-A05, UI-03, E2E-01 | Pending execution on final main |
| AC-06 | UNIT-03, UNIT-05, API-A04, API-A07, UI-03, E2E-01 | Pending execution on final main |
| AC-07 | API-A06, API-W05, API-C03, UI-03, E2E-01 | Pending execution on final main |
| AC-08 | UNIT-02, API-W01, API-W05, UI-04, E2E-02 | Pending execution on final main |
| AC-09 | UNIT-02, API-W02, UI-04, E2E-02 | Pending execution on final main |
| AC-10 | UNIT-02, API-A06, API-W03, UI-04, E2E-02 | Pending execution on final main |
| AC-11 | API-W04, API-C03, UI-04, E2E-02 | Pending execution on final main |
| AC-12 | API-C01, API-C02, API-C03, UI-06, E2E-01 | Pending execution on final main |
| AC-13 | UNIT-06, API-I01, UI-06, E2E-01 | Pending execution on final main |
| AC-14 | UNIT-04, API-D01, UI-02, E2E-03 | Pending execution on final main |
| AC-15 | UNIT-04, API-D02, UI-01, E2E-03 | Pending execution on final main |
| AC-16 | UNIT-04, UNIT-05, API-D03, UI-01, UI-02, UI-05, E2E-03 | Pending execution on final main |
| AC-17 | API-D04, E2E-03 | Pending execution on final main |
| AC-18 | API-W05, MIG-01, MIG-02 | Pending execution on final main |
| AC-19 | MIG-03 | Pending execution on final main |
| AC-20 | UI-05, STYLE-01, STYLE-02, VIS-01 | Pending execution on final main |
| AC-21 | UI-01, UI-02, UI-03, UI-04, UI-06, STYLE-02 | Pending execution on final main |
| AC-22 | API-C02, API-C03, UI-05, E2E-04, REG-01 | Pending execution on final main |
| AC-23 | PERF-01 | Pending execution on final main |
| AC-24 | DOC-01 | Pending execution on final main |

## 4. FR/BR to AC to test traceability

Use section 3 to expand each AC to test IDs/target paths. No requirement is implicitly waived by grouping.

| Requirement | Acceptance criteria |
|---|---|
| FR-01 | AC-01, AC-02 |
| FR-02 | AC-01, AC-03, AC-05 |
| FR-03 | AC-03, AC-06, AC-07 |
| FR-04 | AC-04, AC-05 |
| FR-05 | AC-02, AC-06 |
| FR-06 | AC-08, AC-09 |
| FR-07 | AC-10, AC-11 |
| FR-08 | AC-07, AC-08, AC-18 |
| FR-09 | AC-14, AC-16 |
| FR-10 | AC-15, AC-16 |
| FR-11 | AC-14, AC-15, AC-16, AC-17, AC-23 |
| FR-12 | AC-18, AC-19 |
| FR-13 | AC-02, AC-07, AC-12, AC-13, AC-21 |
| FR-14 | AC-20, AC-21 |
| FR-15 | AC-22, AC-24 |
| BR-01 | AC-01 |
| BR-02 | AC-02 |
| BR-03 | AC-02 |
| BR-04 | AC-01, AC-03, AC-04 |
| BR-05 | AC-03, AC-12 |
| BR-06 | AC-05 |
| BR-07 | AC-05, AC-06 |
| BR-08 | AC-05, AC-09 |
| BR-09 | AC-05 |
| BR-10 | AC-04 |
| BR-11 | AC-04 |
| BR-12 | AC-04, AC-11 |
| BR-13 | AC-06, AC-07 |
| BR-14 | AC-06, AC-13 |
| BR-15 | AC-06, AC-08 |
| BR-16 | AC-07, AC-10 |
| BR-17 | AC-08 |
| BR-18 | AC-09 |
| BR-19 | AC-08, AC-10 |
| BR-20 | AC-10 |
| BR-21 | AC-11 |
| BR-22 | AC-08, AC-11 |
| BR-23 | AC-07, AC-22 |
| BR-24 | AC-12 |
| BR-25 | AC-12, AC-22 |
| BR-26 | AC-13 |
| BR-27 | AC-20, AC-21 |
| BR-28 | AC-14 |
| BR-29 | AC-14 |
| BR-30 | AC-14 |
| BR-31 | AC-14, AC-16 |
| BR-32 | AC-15 |
| BR-33 | AC-15, AC-16 |
| BR-34 | AC-15 |
| BR-35 | AC-14, AC-15, AC-16 |
| BR-36 | AC-16, AC-21 |
| BR-37 | AC-17 |
| BR-38 | AC-18 |
| BR-39 | AC-09, AC-10, AC-18 |
| BR-40 | AC-18 |
| BR-41 | AC-19 |
| BR-42 | AC-22 |

## 5. Performance protocol and query evidence

PERF-01 uses an isolated PostgreSQL schema with exactly 1000 synthetic Tickets and 5000 Actions distributed across statuses/priorities/ownership/cycles, plus sufficient revisions/events for representative queries. Use authenticated Requester and Staff sessions. Benchmark GET /api/requester/dashboard, /api/staff/dashboard, representative recent-update/resolution /api/tickets drilldowns, priority /api/staff/tickets drilldown and /api/staff/actions active/completed views.

For each endpoint: 3 unmeasured warmups, 20 sequential measured complete HTTP requests, correct nonempty or documented zero response assertions, then p95 by nearest rank (19th ascending of 20). Each endpoint must meet <=2000ms. Record all samples/p95, cardinalities, DB/app versions, CPU/RAM, local/container topology and commit; never log credentials or full connection strings. Capture representative database query counts/plans with sensitive fields removed and verify bounded selects/no full collection/N+1 behavior. Cache must not bypass real authorized DB computation. Counts/previews must still match independent SQL queries.

A threshold failure is an investigation/fix task; do not silently relax the budget, skip a measurement or report an unmeasured result. If the agreed environment is unavailable, record the blocker; performance DoD remains pending. Run this intentionally on the performance fixture, not alongside a shared destructive migration suite.

## 6. Migration, seed and recovery protocol

MIG-01 inventories a representative Lab 3 schema before applying Lab 4: primary keys, row counts, FK relationships, status/priority/Owner, createdAt/updatedAt, credential hash checksums (not hashes in output), public/internal messages, attachment metadata and file checksums. After upgrade verify preservation, defaults/version/cycle/baseline labels and absence of invented Actions/resolvedAt. Also test all migrations on an empty schema. Keep the already-Resolved legacy close exception and future active-Ticket gate explicit.

MIG-02 runs scoped seed twice around deliberate credential/user-work changes. It verifies all statuses/priorities/actors, 0/1/many Actions, follow-up, current/historical cycles, inactive assignee and accounts with zero metrics. Existing mutable fixture rows must not be silently reset to manufacture screenshots. Prefer stable test fixture identifiers and insert/upsert only missing owned examples.

MIG-03 creates a local backup artifact outside tracked content using the available PostgreSQL backup tooling and copies the matching task-owned attachment root. Restore into a fresh isolated destination, verify inventory/checksums and auth/attachment smoke, and preserve the source/backup. Document quiescing writes, tool requirements, configuration references and restore order in README. This verifies recovery, not a promise that restoring an old backup retains later writes. Never run automatic down migration after new work has been accepted.

## 7. Commands and required harness integration

Existing scripts verified in package.json:

~~~powershell
# Run from repository root against an explicitly isolated test configuration.
npm --prefix server test
npm --prefix server run test:security
npm --prefix server run test:migration
npm --prefix server run build
npm --prefix client test
npm --prefix client run build
npm run e2e
npm run screenshots
~~~

These existing commands are execution targets; none were run during contract authoring. Implementation Issues must extend the migration config's explicit includes to Lab 4, add the new test paths to the appropriate suites, and add capture.screens.ts to the Playwright screenshot project. Do not assume the current Lab 3-only migration include discovers new files. Builds must still succeed.

The planned e2e/run-lab04.ps1 runner must reuse the validated isolated-schema/port ownership pattern in e2e/run-issue61-full.ps1, with a Lab4-owned schema prefix, isolated uploads, explicit ports, environment restoration and constrained cleanup. Its committed interface will accept ApiPort, ClientPort and optional ScreenshotRoot. After that Issue implements the runner, the intended isolated full verification command is:

~~~powershell
powershell -ExecutionPolicy Bypass -File e2e/run-lab04.ps1 -ApiPort 3001 -ClientPort 5174
~~~

The runner does not exist yet. Document its actual implemented invocation in README before marking results Pass. An explicit ScreenshotRoot artifacts/lab-04/screenshots opts into refreshing grading captures; routine checks write ignored test-results output. Preserve Lab 1-3 runs; do not hide required old suites through discovery narrowing.

## 8. Visual, responsive and accessibility evidence

Apply the [UI checklist](ui-spec.md#10-visual-checklist-and-artifacts). Capture Staff Dashboard, Requester Dashboard and Actions Taken at 1440x900, 820x1024 and 390x844 under their required artifacts/lab-04/screenshots subfolders. Include representative create/edit/correction/complete/cancel/gate/read-only/zero/error screens. Check actual keyboard operation, tab semantics/focus, non-color labels and increased text, plus clipping/overlap/horizontal overflow. Screenshots and a human checklist complement automated CSS/geometry tests; neither substitutes for the other.

## 9. Final results and limitations

| Evidence item | Result at contract authoring |
|---|---|
| Product test execution | Not run; product implementation pending |
| Automated test-file paths in section 2 | Planned targets; verify existence during implementation |
| Performance samples / SQL comparisons | Not measured |
| Backup/restore execution | Not run |
| Screenshots / manual keyboard inspection | Not captured/performed for Lab 4 |
| Peer review / release PR / final main SHA | Pending; see reviewer.md |
| Documentation consistency inspection | Record the actual authoring inspection in reviewer.md |

For each execution, record command, timestamp/time zone, exact commit/branch, isolated environment, suite passed/failed/skipped counts, log/artifact path and any linked defect. Final evidence must come from main after the release merge, not a historical Lab 3 total or only a feature branch. Fix discovered defects via linked Issues/PRs, re-run affected checks and integrated required checks as warranted. Required flaky/skipped/disabled/failed tests keep DoD incomplete. Unknown legacy resolved times and pre-Lab4 child-only updated activity are documented data limitations, not deferred tests. No approved required scenario is intentionally deferred.
