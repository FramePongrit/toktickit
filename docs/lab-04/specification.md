# Lab 4 Sprint Engineering Specification

Project: TokTickIT. Stakeholder decisions and contract authoring approved on 2026-10-23. Contract peer review and merge are recorded in [reviewer.md](reviewer.md); implementation and release evidence are recorded separately.

Baseline: released Lab 3 main, commit 1a20e3465922a2c1dacc5a9eb18e55b0840284b8, released through [PR 83](https://github.com/FramePongrit/toktickit/pull/83). Deadline: **2026-10-29, Asia/Bangkok**; internal release/evidence target: October 28.

Companion contracts: [UI](ui-spec.md), [REST API](api-spec.md), [tests and traceability](tests.md), [Issues and delivery plan](issue-plan.md), [review record](reviewer.md). Existing behavior: [Lab 3 specification](../lab-03/specification.md), [Lab 3 API](../lab-03/api-spec.md), [domain vocabulary](../../CONTEXT.md). Source requirements: CPE334 "Lab 4. TokTickIT Actions Taken, Dashboards, and Final Regression", 11 pages, plus inherited Lab 2/3 presentation and process rules.

## 1. Sprint goal

Complete the service-desk workflow with collaborative Actions Taken, evidence-based Ticket resolution, concise role dashboards, and a secure, accessible, regression-tested application with traceable final-main evidence for all 60 assessment points.

## 2. Stakeholder request interpretation

A Ticket Owner coordinates the overall request; different IT Staff may own and perform individual Actions. Actions document work and its outcome, with follow-up and file-reference notes. Requester resolution indications remain advisory. Operational staff formally resolve work using server-enforced evidence. Requesters see their own work and attention needs; Staff see workload and priority. The increment preserves existing Users, Tickets, communications, attachments, authentication and administration.

## 3. Scope

### Included

- Actions Taken list/create/assign/edit/start/complete/cancel, authenticated actor attribution, immutable revision history, and Requester read-only visibility.
- Existing Ticket transition matrix plus resolution gate, work cycles, workflow history, atomic cancellation, stale-write protection and safe request retries.
- Requester and Staff dashboards; Administrator uses Staff dashboard without optional account-count cards. Matching list filters and URL navigation.
- Additive Prisma/PostgreSQL migration, legacy baseline records, idempotent demonstration seed and tested backup/recovery.
- Zen Green navigation, forms, table/card layouts, keyboard/accessibility, responsive evidence and full Labs 1-3 regression.
- Specification/test planning before feature implementation; reviewed Issue branches into lab4-staging, release into main, and one final PDF with Answer Parts 1-9.

### Excluded

SLA clocks, escalation/on-call/breach services; email/SMS/LINE/push notifications; stock/spares/purchasing/cost accounting; billing/payroll; multi-level approval/e-signature; BI/report builders/export warehouses; multi-tenancy/production cloud operations; per-Action file-upload subsystem; optional Admin user-count dashboard; unrelated refactors or features. Existing Ticket attachments remain the file system for this increment.

## 4. Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Staff/Admin can list all Actions on an accessible Ticket; Requester can list all current Action representations on an owned Ticket across all cycles/statuses. |
| FR-02 | Staff/Admin can create a Planned Action with required Description, occurrence time and eligible assignee, defaulting to themselves. |
| FR-03 | Staff/Admin can edit/reassign unfinished Actions and correct permitted terminal fields with a reason and audit trail. |
| FR-04 | Staff/Admin can start, complete or cancel Actions according to the Action matrix, with backend validation and authenticated attribution. |
| FR-05 | Staff/Admin can inspect immutable Action revisions; Requesters cannot retrieve revision records. |
| FR-06 | The backend enforces the complete Ticket matrix, active Owner prerequisite and current-cycle resolution gate. |
| FR-07 | Reopening starts a fresh work cycle; Ticket cancellation atomically cancels unfinished Actions. |
| FR-08 | Authorized readers see a stable public Ticket status timeline, including explicitly labelled legacy baseline snapshots. |
| FR-09 | Requester dashboard contains four own-Ticket metrics, recent updates, recent resolutions and matching My Tickets drill-down. |
| FR-10 | Staff/Admin dashboard contains four workload metrics, all-status counts, priority/recent Tickets and current-user completed Actions. |
| FR-11 | Dashboard counts, preview lists, dates and filtered detailed lists share documented backend predicates; URLs survive reload/back/forward. |
| FR-12 | Migration/seed/recovery preserve earlier data and demonstrate zero/non-zero metrics and zero/one/many Actions. |
| FR-13 | Authorization, optimistic versions, parent-row transactions and idempotency prevent data exposure, lost updates, duplicate work and post-final writes. |
| FR-14 | Role navigation, Zen Green UI, feedback, responsiveness and accessibility remain consistent throughout the application. |
| FR-15 | Labs 1-3 behavior and final-main test evidence remain complete, with current setup/test/demo documentation. |

## 5. Business rules

### Identity, assignment and visibility

| ID | Rule |
|---|---|
| BR-01 | Each Action belongs to exactly one Ticket and one immutable work-cycle number. Ticket Owner and Action assignee are different concepts. |
| BR-02 | Only current active STAFF/ADMIN without mandatory password change may write Actions. A Requester never writes Actions, including by direct API. |
| BR-03 | Requester reads are scoped by authenticated ownership, not supplied requesterId. Cross-owner/nonexistent resources return indistinguishable 404. All Actions and public status events on the owned Ticket are visible; Internal Notes and Action revisions are not. |
| BR-04 | Every new Action has an active STAFF/ADMIN assignee. Default is caller. Any authorized Staff/Admin may collaborate, edit and complete work; completing user need not be assignee or Ticket Owner. |
| BR-05 | Historical identities/FKs remain. Deactivation/demotion does not silently reassign Actions. An unfinished Action must have a currently eligible assignee before starting/completing; other active operational users may cancel it. Existing protection against invalidating a non-final Ticket Owner remains in force. |

### Action fields, states and audit

| ID | Rule |
|---|---|
| BR-06 | Description is trimmed plain text, 1-2000 characters. Result is optional before completion, required 1-2000 on completion and on later Completed corrections. Follow-up Note max 2000; Attachment Notes, correction reason and cancellation reason max 1000. Required values reject whitespace-only text. Optional empty text normalizes to null. |
| BR-07 | actionAt defaults to server now and is staff-editable within Ticket.createdAt <= actionAt <= current server time. It is occurrence time, not a future schedule. createdAt/completedAt/cancelledAt are immutable server timestamps. Store UTC; render Asia/Bangkok. |
| BR-08 | followUpRequired defaults false. When true, a nonempty Follow-up Note is mandatory, including during edits. A note may remain when false for context. Follow-up true permits Action completion but blocks Ticket resolution while that Completed Action belongs to the current cycle. |
| BR-09 | Attachment Notes are plain text referencing existing Ticket files; they do not upload, grant file access, create external links automatically, or replace existing attachment permissions. |
| BR-10 | Creation always produces PLANNED. PLANNED -> IN_PROGRESS/COMPLETED/CANCELLED; IN_PROGRESS -> COMPLETED/CANCELLED. COMPLETED/CANCELLED have no outgoing transitions. Starting a Planned record is optional for retrospective completion. |
| BR-11 | Completing validates effective saved/submitted Result and actionAt; sets performedById to authenticated completer and completedAt to server now. These are null before completion and remain immutable afterward. createdById always identifies the authenticated creator separately. |
| BR-12 | Cancelling an Action requires a reason; sets cancelledById/cancelledAt automatically. It does not claim that work was performed. Completed records cannot be cancelled. |
| BR-13 | In the current mutable cycle, PLANNED/IN_PROGRESS descriptions/result/actionAt/follow-up/file notes/assignee may be edited. COMPLETED/CANCELLED descriptive fields, Result, actionAt and follow-up may be corrected only with a required correction reason. Terminal status, assignee, creator, performer and server timestamps cannot be rewritten. |
| BR-14 | Action creation/transitions/corrections produce append-only revisions, including actor, server time, operation, reason where required and before/after snapshots. No Action/revision deletion API exists. Revisions must never be updated/deleted by normal application operations. |
| BR-15 | Actions are ordered createdAt ASC, id ASC, across all cycles. Corrections never change position. Revisions are ordered sequence ASC. Public workflow events are ordered occurredAt ASC, id ASC. |
| BR-16 | Action writes require parent status NEW/OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER/REOPENED AND Action cycle = Ticket current cycle. RESOLVED/CLOSED/CANCELLED Actions are read-only. Earlier-cycle Actions stay read-only after reopening. |

### Ticket workflow

| ID | Rule |
|---|---|
| BR-17 | Preserve the matrix in section 6. An eligible active current Ticket Owner is required for every transition, including cancellation/closure, as in Lab 3. Authorized Staff/Admin need not be that Owner. |
| BR-18 | To enter RESOLVED, current cycle must contain >=1 COMPLETED Action, zero PLANNED/IN_PROGRESS Actions and zero COMPLETED Actions with followUpRequired=true. CANCELLED Actions do not satisfy completed evidence and do not block by their follow-up flag. |
| BR-19 | Requester resolution indication does not alter Ticket status and does not bypass the gate. Existing indication eligibility and duplicate handling remain; entering REOPENED clears the indication. |
| BR-20 | RESOLVED -> REOPENED increments workCycle once, clears current resolvedAt, retains earlier events/Actions, and requires fresh Action evidence in the new cycle before the next resolution. Earlier Actions are not copied or reopened. |
| BR-21 | Ticket cancellation requires a reason and cancels every unfinished Action of the current cycle with the same actor/time/reason, Action revisions and one Ticket transition event, all in one transaction. Any failure rolls back every change. Completed/Cancelled Actions remain. |
| BR-22 | Each actual status transition appends a public WorkflowEvent with from/to status, actor/time/cycle and public comment/reason reference where applicable. WAITING_FOR_REQUESTER still inserts its mandatory Public Comment atomically. No public event contains Internal Note text or Action revision payloads. |
| BR-23 | CLOSED/CANCELLED are final and immutable for every earlier mutation too. RESOLVED is non-final: existing Public Comments/Internal Notes/Requester Attachment rules continue, while Action writes are blocked. No transition reopens CLOSED; recurrence uses a new Ticket. |

### Concurrency, retry and safe failure

| ID | Rule |
|---|---|
| BR-24 | Ticket.version guards shared operational state: Claim/Owner/IT Priority/status and Action writes. Action.version independently guards edits/transitions. Clients supply expected versions and must reload/review on 409; no silent merge or overwrite. |
| BR-25 | Relevant active/role checks, Owner/assignee eligibility, versions, matrix/gate, history and mutation commit under the existing parent-Ticket transaction. Lock candidate/required Users in deterministic id order before Ticket, then Action rows in id order. Recheck/retry if prerequisite identities changed while acquiring locks; never weaken Lab 3 finality/Admin races. |
| BR-26 | Action-create and Action/Ticket status transitions require Idempotency-Key. A successful logical request and its history commit once; same actor/method/path/key/body replays its original success, even if versions are now stale. A different payload with a successful key is 409. Replays still require current authentication/authorization. See API for exact scope/precedence. |
| BR-27 | Safe 400/401/403/404/409/500 errors use existing envelopes; no stack, SQL, credentials, session tokens or another Requester's data. Busy controls prevent accidental duplicate clicks, and recoverable failures/conflicts preserve draft form values for explicit review. |

BR-26 concurrent duplicates serialize on the request-scope advisory lock and re-read committed success before evaluating mutable versions. Canonicalization uses normalized submitted JSON, independent of property ordering and JSON formatting whitespace, before dynamic defaults; see [API section 6](api-spec.md#6-idempotency-and-conflicts) and UNIT-06/API-I01.

BR-13 deliberately permits an authorized, reasoned and audited correction from Completed follow-up=true to false. This removes that Action's follow-up blocker; all other BR-18 prerequisites still apply. A separate new Action is not required by this policy. API-W02 must verify that sequence.

BR-20 workflow events record the resulting Ticket workCycle. The RESOLVED -> REOPENED event therefore carries the new incremented cycle and starts that cycle's timeline; API-W03 verifies this field.

### Dashboard calculations

Define ACTIVE = {NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED}. Capture one server asOf timestamp and use one database snapshot per Dashboard request. start = Bangkok midnight six calendar days before asOf's Bangkok date; matching time is start <= value <= asOf. End-of-day future data is never included. Counts are integer zero and previews empty arrays when no matches exist. Five records per preview; full lists paginate 10/20/50.

The recent window is the last 7 Bangkok calendar days including today, ending at asOf. Priority severity is URGENT > HIGH > MEDIUM > LOW; PostgreSQL's existing LOW/MEDIUM/HIGH/URGENT enum declaration supports descending ordering, and API-D02 must assert the exact order. Requester-authored Public Comments and attachment changes intentionally count as recent updates under BR-37.

| ID | Metric / calculation |
|---|---|
| BR-28 | Requester base predicate is Ticket.requesterId = authenticated user id for counts AND preview/list queries. |
| BR-29 | Open Tickets: base AND currentStatus in ACTIVE. Waiting for Me: base AND currentStatus=WAITING_FOR_REQUESTER. |
| BR-30 | Recently Updated: base AND updatedAt in [start,asOf]. Recently Resolved: base AND currentStatus in {RESOLVED,CLOSED} AND non-null resolvedAt in [start,asOf]. No inferred historical resolve times. |
| BR-31 | Requester recentUpdated preview: BR-30 updated predicate, updatedAt DESC,id DESC. RecentResolved preview: BR-30 resolved predicate, resolvedAt DESC,id DESC. Each max five, with matching detailed URL. |
| BR-32 | Staff Unassigned Tickets: ACTIVE AND ownerId null. My Active Tickets: ACTIVE AND ownerId=caller. High/Urgent Tickets: ACTIVE AND itPriority in {HIGH,URGENT}, never requestedPriority. |
| BR-33 | Staff My Active Actions: Action.assigneeId=caller AND status in {PLANNED,IN_PROGRESS} AND parent in ACTIVE AND cycle=parent.workCycle. Count Actions, not distinct Tickets; drill-down is a paginated Action list in Dashboard. |
| BR-34 | Staff Ticket status breakdown includes all eight statuses and zero counts. Priority/recent preview: ACTIVE, itPriority severity DESC, updatedAt DESC,id DESC, max five. Current-user completed preview: performedById=caller AND status=COMPLETED AND completedAt in [start,asOf], completedAt DESC,id DESC, max five; includes retained earlier-cycle work as historical performed work. |
| BR-35 | Every card/list uses a documented backend query and matching drill-down. Responses carry generatedAt, window and unit, not full Ticket collections. Admin reuses Staff dashboard. Date parameters are server validated; authorization cannot be overridden by filters. |
| BR-36 | Load on Dashboard entry, explicit Refresh and after relevant completed mutations; no periodic polling. Cancel obsolete role/filter requests; never render one user's cached response under another identity. Failed refresh may retain labelled stale values, never mislabel failure as zero. |
| BR-37 | From Lab 4, Ticket.updatedAt advances for successful visible operational Ticket changes, Actions, Public Comments, Requester indication and attachment add/remove. Internal Notes do not change this metric. Failed/no-op/idempotent replay writes do not advance it. Older updatedAt values remain unchanged, so earlier child-only activity is not reconstructed. |

### Migration and regression

| ID | Rule |
|---|---|
| BR-38 | Additive migration preserves all existing ids, values, credentials, attachment metadata/files and relations. Existing Tickets start workCycle=1, version=1, resolvedAt=null, with one explicitly typed BASELINE event containing observed status and migration time; this is not a historical transition or evidence of resolution time. |
| BR-39 | Do not fabricate legacy Actions/results. Already-RESOLVED legacy Tickets may CLOSE without newly entering RESOLVED; REOPENED Tickets follow new-cycle rules. Legacy active Tickets need new completed Action evidence before a future RESOLVED transition. |
| BR-40 | Idempotent fixtures cover every major Ticket/Action status, priorities, assigned/unassigned, zero/one/many Actions, different actors, follow-up, old/new cycles, inactive assignee and zero/non-zero metrics. Re-running seed must not change established credentials, user work or production rows. |
| BR-41 | Migration backup and tested restore include DB plus actual attachment files/configured file root. Verify recovery in an isolated destination and preserve the source/backup. No destructive automatic down migration or arbitrary shared-schema reset. |
| BR-42 | Preserve authentication, forced password change, logout/revocation, ownership, Ticket numbering, searches/lists, communications, attachment lifecycle and minimal Administrator safety. Earlier automated tests may be updated only for explicitly changed Lab 4 contracts; do not delete/weaken assertions to obtain green output. |

## 6. UI specification summary and transition matrices

| Ticket from | Allowed destinations |
|---|---|
| NEW | OPEN, CANCELLED |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, CANCELLED |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| WAITING_FOR_REQUESTER | OPEN, IN_PROGRESS, CANCELLED |
| RESOLVED | CLOSED, REOPENED |
| REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| CLOSED / CANCELLED | None |

Allowed destinations remain subject to Owner, version and resolution prerequisites. Server returns availability and safe gate reasons; UI guides but is not authority. Full controls, modes, state handling, focus, responsive rules and screenshot matrix are in [ui-spec.md](ui-spec.md).

## 7. Data changes and migration

Logical fields below are the implementation target; existing integer id conventions and Prisma/PostgreSQL are retained. Foreign keys to Ticket/User restrict deletion of new historical records. No JSON body is a substitute for relational Ticket/assignee/status fields used by queries.

| Model | Increment |
|---|---|
| Ticket | workCycle Int default 1; version Int default 1; resolvedAt nullable DateTime. resolvedAt set on successful RESOLVED, retained on CLOSED, cleared on REOPENED. Existing updatedAt semantics extended prospectively by BR-37. |
| ActionTaken | Int id; ticketId; workCycle; status ActionStatus default PLANNED; description Text; result nullable Text; actionAt; assigneeId; createdById; performedById nullable; followUpRequired Boolean default false; followUpNote/attachmentNotes nullable Text; version Int default 1; createdAt/updatedAt; completedAt/cancelledAt/cancelledById/cancelReason nullable. Completion and cancellation fields mutually consistent with status. |
| ActionRevision | Int id; actionId; sequence Int; operation CREATE/EDIT/TRANSITION/TICKET_CANCEL; actorId; occurredAt; reason nullable; before nullable Json; after Json. Unique(actionId,sequence); sequence equals resulting Action version. Complete snapshots of Action business fields, not auth/private Ticket data. |
| TicketWorkflowEvent | Int id; ticketId; workCycle; kind CREATED/BASELINE/TRANSITION; fromStatus nullable; toStatus; actorId nullable only for migration baseline; occurredAt; publicCommentId nullable; reason nullable; ticketVersion. CREATED/BASELINE are distinguished from actual transitions. |
| IdempotencyRecord | Int id; userId; method; canonicalPath; key; payloadDigest; httpStatus; response Json; createdAt. Unique(userId,method,canonicalPath,key). Persist successes transactionally; no automatic expiry/cleanup feature in this lab. Never store cookies, CSRF tokens or raw auth headers. |

Required indexes: Action(ticketId,createdAt,id), Action(ticketId,workCycle,status), Action(assigneeId,status,ticketId), Action(performedById,completedAt,id); Revision(actionId,sequence); Event(ticketId,occurredAt,id); Ticket(requesterId,updatedAt,id), Ticket(requesterId,currentStatus,resolvedAt,id), Ticket(currentStatus,itPriority,updatedAt,id). Keep earlier useful indexes and justify any consolidation with measurements.

Required DB constraints: positive cycles/versions; unique revision sequence; Action terminal timestamp/actor consistency; required terminal Result/cancelReason; required note when follow-up true; valid FK relations. Use Prisma migration SQL checks where the Prisma schema cannot express them. Cross-table cycle/gate/date bounds remain transactional backend rules. A replay does not produce new revisions or bump versions.

Design justifications: (1) separate relational Action assignee/performer/creator and Ticket Owner preserve collaboration and accountable attribution; (2) append-only revisions/events plus current rows support both audit and efficient UI/querying; (3) optimistic versions complement row locks by detecting stale human edits, which locks alone cannot identify; (4) nullable resolvedAt avoids claiming unknown historical times and supports honest time-based metrics.

Migration order: back up and inventory Lab 3 rows/files; apply additive columns/enums/tables/indexes/constraints; backfill only cycle/version/baseline snapshots; regenerate Prisma; seed scoped fixtures; verify row/FK/file/credential preservation; verify upgrade and fresh install, seed twice and isolated restore. Product writes must be quiesced during migration/backup cutover. Recovery returns the previous application plus verified matching DB/file backup; if Lab 4 writes already exist, preserve a copy and account for those writes before restoring an older snapshot. Never describe an automatic no-data-loss rollback after accepting new writes.

## 8. API contract

See [api-spec.md](api-spec.md) for exact paths, payloads, response fields, versions, pagination, errors, authorization, guard precedence, replay and Dashboard query definitions. Existing endpoint capabilities remain, with explicit expected-version additions to Staff operational write payloads and additional read fields. Update all first-party callers and impacted regression fixtures in the same Issue. Public comments/attachments/indications retain their Lab 3 input shapes; append/atomic operations are not shared-field replacement APIs.

## 9. Acceptance criteria

| ID | Observable acceptance criterion | Primary rules |
|---|---|---|
| AC-01 | Authorized creation saves one Planned Action under the correct Ticket/current cycle and default/selected eligible assignee, with server creator/time and one CREATE revision. | BR-01-07,14 |
| AC-02 | Requester sees every Action of an owned Ticket but cannot write or read revisions; cross-owner routes disclose no data. | BR-02-03 |
| AC-03 | A non-owner Staff member can collaborate; reassignment rejects inactive/Requester targets and retained inactive assignees must be replaced before start/complete. | BR-04-05 |
| AC-04 | All allowed Action transitions succeed and all absent edges fail without partial change; completion attributes the actual caller and requires Result; cancel requires reason. | BR-10-12 |
| AC-05 | Field boundaries, occurrence dates, follow-up note and file-note text are validated by UI and API, including effective merged PATCH state. | BR-06-09 |
| AC-06 | Authorized corrections preserve immutable identities/status/timestamps, require terminal correction reasons and append accurate revisions; ordering survives timestamp edits. | BR-13-15 |
| AC-07 | Resolved/final Ticket and earlier-cycle Actions cannot be mutated, including malformed requests; authorized historical reads continue. | BR-16,23 |
| AC-08 | Every allowed Ticket edge and Owner prerequisite is enforced server-side; Waiting comment/history/status are atomic and advisory indication never resolves a Ticket. | BR-17,19,22 |
| AC-09 | Resolving without completed evidence, with unfinished work or outstanding completed follow-up is rejected; all satisfied conditions permit resolution. | BR-18 |
| AC-10 | Reopen clears indication/resolvedAt, increments one cycle, retains locked earlier Actions and requires new work evidence before resolution. | BR-20 |
| AC-11 | Ticket cancellation and all unfinished Action cancellations/audits commit together or all roll back. | BR-21 |
| AC-12 | Shared stale writes return 409 without overwrite; controlled races against finality/User changes cannot commit invalid work. | BR-24-25 |
| AC-13 | Duplicate successful creates/transitions produce one effect and replay one response; different-payload key reuse conflicts and unauthorized replay is denied. | BR-26 |
| AC-14 | All four Requester metrics and five-row previews match authoritative own-Ticket queries at Bangkok date boundaries, including zeros and unknown legacy resolution times. | BR-28-31 |
| AC-15 | Staff/Admin metric counts/status breakdown/priority preview/current-user performed work are correct, with Action and Ticket units distinguished. | BR-32-35 |
| AC-16 | Each card/View all reaches exactly matching filters and ordering; URL refresh/back/forward retains state, manual refresh works and identity changes cannot leak cached data. | BR-35-36 |
| AC-17 | Relevant new public activity updates Ticket.updatedAt while Internal Notes, rejected requests and replays do not; legacy timestamps are retained. | BR-37 |
| AC-18 | Fresh/upgrade migration and twice-run seed preserve existing ids/values/relations/credentials/files; legacy zero-action/resolution exceptions and baseline events are honest. | BR-38-40 |
| AC-19 | A documented isolated restore reproduces the inventoried DB/attachment state without altering the source or unrelated schema/processes. | BR-41 |
| AC-20 | All required new and existing screens work at desktop/tablet/mobile sizes with readable Zen Green controls, keyboard focus and no page overflow. | BR-27,42; FR-14 |
| AC-21 | Loading, success, empty/no-results, validation, forbidden, not-found, conflict and recoverable failure are distinct, safe, accessible and preserve relevant drafts. | BR-27,36 |
| AC-22 | Complete Labs 1-3 regression remains passing, including auth/session/CSRF, Requester workflow, attachments, comments/notes, Staff operations and Admin safety. | BR-23,25,42 |
| AC-23 | With 1000 Tickets/5000 Actions in an isolated fixture, warmed Dashboard/drill-down endpoints meet p95 <= 2000ms over 20 measured requests per endpoint; environment and query evidence recorded. | FR-11,13 |
| AC-24 | Final main has complete traced test output, reviewed PR/Issue history, current README/setup/demo and readable Answer Parts 1-9 evidence. | FR-12-15 |

Every AC maps to planned test IDs and actual target paths in [tests.md](tests.md). Before implementation those files are planned, not falsely reported as existing or passing.

## 10. Definition of Done

### Product completion

- [ ] FR-01 through FR-15 and AC-01 through AC-23 are implemented and independently evidenced.
- [ ] Data, API and UI conform to the approved contract; safe failures, authorization, concurrency and idempotency tested beyond hidden controls.
- [ ] Required unit, API/integration, UI component/style, responsive, authorization, workflow, migration/recovery/regression, performance smoke and E2E checks pass with no required skipped/disabled tests.
- [ ] Every AC links to test ID, real test-file path, exact command, final commit and result; no fabricated counts.
- [ ] Backup/restore and fresh/upgrade paths verified; zero/one/many Action seeds and zero/non-zero Dashboard cases reproducible.
- [ ] All major Lab 4 screens visually inspected at 1440x900, 820x1024 and 390x844, with keyboard checks and no clipping/overlap/page overflow.
- [ ] Console errors, broken links, placeholders, duplicate/unfinished controls and temporary UI removed. Existing features remain usable.
- [ ] README documents setup/migration/seed, full tests, isolated runner/recovery and role-based demonstration. No credentials/runtime uploads/dependencies accidentally tracked.

### Course delivery (separate from product behavior)

- [ ] Issue plan published before implementation; Backlog/Specified/Started/PR Review/Fixing/Done used truthfully.
- [ ] Each Issue uses a feature branch and peer-reviewed PR into lab4-staging; no direct development on main/staging.
- [ ] reviewer.md records real reviewer identities, comments, responses, approvals, actual PR/Issue links and final merge commits.
- [ ] Approved contract provenance predates completed main feature PRs. Release PR lab4-staging -> main is reviewed, merged and final main rerun is recorded.
- [ ] Full working AI capture stays in the requested external staging file; prepare the required curated docs/lab-04/ai-use.md later with actual LLM identification, 6-10 selected prompts and the student's own reflection. Do not invent reflection/reviews.
- [ ] Exactly one concise PDF, Answer Part 1 through Answer Part 9 in order, contains all 60-point evidence, working links and readable screenshots. Deadline October 29; details in issue-plan.md.

## 11. Assumptions and decisions

The interview explicitly settled the handout's underspecified areas: grading-only Action assignment/lifecycle is included; editable Actions have append-only revision history; Requester sees all owned-Ticket Actions; occurrence and creation times are separate; only operational roles formally transition Tickets; resolution uses current-cycle evidence; Admin uses Staff dashboard. These are approved project choices, not quotations of rules absent from the handout.

No real-world deadline time-of-day was supplied: October 29 is the final delivery date; use the course's actual submission cutoff when known. October 28 is the internal product/release target. Existing historical Lab 3 test counts are not Lab 4 test results. Implementation must raise a contract contradiction before changing an approved policy and update all affected companion documents together.
