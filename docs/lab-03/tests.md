# Lab 3 Test-Driven Delivery Plan

**Status:** Post-PR #80 integrated evidence is recorded from `lab3-staging` merge commit `7db4e1d`. Issue #62 and PR #80 are merged/closed/Done. Issue #81 is **Open / Backlog**; its reproducibility fixes and the verification below are currently uncommitted changes in `feature/18-release-reproducibility`, so this document makes no claim that `main` has been verified.
**Related documents:** [specification](./specification.md) · [API contract](./api-spec.md) · [UI specification](./ui-spec.md)

The catalog tables below preserve the approved contract assertions. The final execution status and exact observed totals are centralized in §6 so that a test-plan description is not mistaken for a command result.

## 1. Test strategy and isolation

Tests are specified before the feature PRs. Each server test uses isolated, deterministic fixture Users/Tickets and removes only rows/files it creates; migration tests run both a fresh schema and an upgraded Lab 2 fixture. Database clock/randomness/throttle storage are injectable for deterministic auth/expiry/race tests. REG-01 under Issue 7 is the sole executor and owner of the exact Lab 1/Lab 2 server/client manifest in §5; only identity setup and expectations that are obsolete because of authenticated Lab 3 (the Development Requester selector and `X-Requester-Id`) may be intentionally adapted. MIG-01/MIG-02 remain database/fixture-only and do not execute that manifest or HTTP authentication lifecycle. Server suites remain sequential while sharing the configured local database, as documented in Lab 2.

All security/authorization assertions call the API directly in addition to hiding/disabling UI controls. Every mutation test supplies a valid session-bound CSRF token unless it is specifically testing its absence/mismatch. No test output logs a password, hash, JWT, CSRF value, or server secret.

## 2. Planned automated tests

### 2.1 Authentication and authorization

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| UNIT-A01 | Unit | AC-01, AC-02, BR-03, BR-04 | Password boundaries, letter/digit rule, confirmation and no-current-password reuse | `server/tests/lab-03/auth.api.test.ts` | Planned |
| UNIT-A02 | Unit | AC-01, BR-03, BR-06-BR-09 | bcrypt cost, JWT signature/expiry, session revocation, fixed-session CSRF generation/validation/invalidation, cookie and `Cache-Control: no-store` attributes, throttle window | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-A01 | API | AC-01, BR-01-BR-06 | Valid active Login returns SafeUser/cookie/CSRF; generic unknown/wrong credential failures | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-A02 | API | AC-01, BR-01, BR-05 | Inactive after valid credential and throttle behavior; no cookie or account leakage | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-A03 | API | AC-01, AC-02, BR-07-BR-10 | Using the migrated legacy Requester fixture and exact `TokTickIT123!` value from specification §9, HTTP Login succeeds, a normal route is blocked by the mandatory-password gate, Change Password succeeds, changed-password Login succeeds, and the old Initial Password is rejected; also prove `me` reload bootstrap returns the same-session token with `no-store`, password change revokes prior sessions and returns a new token, and Logout requires a token and blocks reuse. No plaintext password or hash is returned/logged. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-Z01 | API | AC-03, BR-09, BR-28, BR-31 | Unparseable JSON returns generic transport `400` before application guards; missing/forged/expired/revoked/orphaned JWT; Mandatory Password Change/Role/CSRF failures run before Ticket resource/domain work; Role/current active state re-read from DB | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-Z02 | API | AC-03, AC-04, BR-16, BR-26 | Requester cannot access another Ticket/Attachment (404), cannot spoof requesterId, and Staff/Admin/Requester route boundaries | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-Z03 | API | AC-03, AC-05, BR-23, BR-28 | Requester direct Internal Note access is forbidden with no note representation; User-management direct access denied to non-Admin | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-Z04 | API/fault injection | AC-03, BR-25 | Force an unexpected database/service failure after protected-route guards and assert exactly `500 INTERNAL_ERROR`; response contains no stack trace, SQL, filesystem path, hash, token, secret, or hidden-resource detail | `server/tests/lab-03/authorization.api.test.ts` | Planned |

### 2.2 Comments, notes, Requester continuation

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| API-R01 | API | AC-04, BR-16, BR-17, BR-26, BR-29 | Sole Requester-regression owner: authenticated Lab 2 create/list/detail/Attachment ownership behavior and absent selector endpoint, every Requested Priority initializes matching `itPriority`, supplied `itPriority` is rejected, and later reads preserve immutable Requested Priority | `server/tests/lab-03/requester-regression.api.test.ts` | Planned |
| API-AT01 | API/CORS | AC-03, AC-04, BR-09, BR-26, BR-29, BR-31-BR-33 | Exact configured-origin credentialed CORS/preflight permits JSON and multipart `FormData` with `X-CSRF-Token` but not arbitrary Origin or hard-coded boundary; malformed multipart `400` and streamed >5 MB `413` occur before domain guards with no temp file/row; parsed upload/remove guard order, Final+invalid upload/removal, type/count/`NO_FILE`, `ALREADY_REMOVED`, safe ownership `404`, and every rejection/database/filesystem failure leaves no orphan file or row | `server/tests/lab-03/attachments.api.test.ts` | Planned |
| API-C02 | API | AC-05, BR-23-BR-25, BR-31 | Public Comment visibility/author/time/plain-text boundaries; appends succeed on `RESOLVED`; Final Ticket history reads succeed while Final plus invalid/blank/over-limit body returns `409 TICKET_FINAL` before validation | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-C03 | API | AC-05, BR-24, BR-34 | Requester Resolution Indication records once, changes no status, and rejects duplicate/Resolved/final eligibility cases; assert the combined Resolved-plus-existing-indication state deterministically returns `RESOLUTION_INDICATION_NOT_ALLOWED`, and finalization races roll back the losing indication with `TICKET_FINAL` | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-C04 | API | AC-05, BR-23, BR-24, BR-31 | Internal Note Staff/Admin-only retrieval/create, append-only validation/author/time, `RESOLVED` append success, Final history read and Final plus invalid/blank/over-limit post returns `409 TICKET_FINAL`, no Requester data leak | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |

### 2.3 Queue and Staff Ticket operations

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| API-Q01 | API | AC-06, BR-27 | Role denial; search each documented field; each filter alone and AND combinations | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-Q02 | API | AC-06, BR-27, D-05 | Default Active scope/order; every `itPriority`/`createdAt`/`updatedAt`/`ticketNumber`/status sort direction with exact secondary/final tie keys; All scope and page boundaries | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-Q03 | API | AC-06, BR-27, BR-30 | `GET /api/staff/ticket-owners` allows Staff/Admin, returns every active eligible Owner even without Tickets in `LOWER(fullName), id` order and exactly safe fields; Owner modes (me/unassigned/id), non-eligible numeric Owner safe field validation, 10/20/50 pagination, empty metadata, invalid query field errors/no clamping | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-S01 | API | AC-07, BR-18-BR-19 | Staff Detail Role access, permitted attachments download-only, Requester denied Staff view | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-S02 | API | AC-07, AC-08, BR-18-BR-20, BR-24, BR-25, BR-31, BR-34-BR-35 | Concurrent Claim has exactly one success/one 409; concurrent Reassign using one `expectedOwnerId` has exactly one success and one `409 TICKET_OWNER_CHANGED` with safe current owner; stale Reassign never overwrites; Reassign raced with target deactivation/demotion leaves either an eligible new Owner plus `USER_OWNS_NON_FINAL_TICKETS` or `OWNER_NOT_ELIGIBLE`; Final/Unassigned precede malformed target, target probing remains identical `OWNER_NOT_ELIGIBLE`, and Claim against an owned Ticket remains `TICKET_ALREADY_ASSIGNED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-S03 | API | AC-07, AC-08, BR-24, BR-31, BR-34 | IT Priority update is independent/Role-protected and never changes Requested Priority; Final plus invalid IT Priority returns `409 TICKET_FINAL`, while only a Non-final invalid enum returns `400 VALIDATION_FAILED`; an interleaved final transition makes the priority write lose with `TICKET_FINAL` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-S04 | API | AC-07, AC-08, BR-19-BR-22, BR-24, BR-31, BR-34 | Every allowed status edge succeeds; Final plus invalid status or Waiting Comment returns `409 TICKET_FINAL`; Non-final missing/ineligible Owner precedes status/body validation; every absent edge/invalid body then fails; Waiting comment transaction commits atomically; indications clear on Reopened; terminal finality; finalization serializes with every Status mutation | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-M01 | API/interleaving | AC-04, AC-05, AC-07, AC-08, BR-34 | Controlled barriers race `CLOSED`/`CANCELLED` against Public Comment, Internal Note, Resolution Indication, Claim, Reassign, IT Priority, status, Attachment add, and Attachment removal; each pair proves one serialized outcome, no post-final mutation, `409 TICKET_FINAL` for the loser, and Attachment cleanup/no unintended row | `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts` | Planned |

### 2.4 Administrator and migration/regression

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| API-U01 | API | AC-09, BR-11, BR-15 | Admin list/search/Role and active-status filters with AND semantics; non-Admin denial; safe representation has no sensitive fields | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-U02 | API | AC-09, BR-02-BR-04, BR-11, BR-15 | Create with each Role/active state, normalized duplicate email, invalid Role/password, initial mandatory change | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-U03 | API/interleaving | AC-09, BR-12-BR-15, BR-35 | Edit/activate/deactivate/Role change/revoke sessions; own name/email succeeds while own Role/active state is rejected; `ADMIN` to `STAFF` succeeds with owned Non-final Tickets; deactivation/Role-to-Requester, self reset, last active Admin, and owned-Ticket conflicts; Final historical Owner allowed; controlled concurrent demotion/deactivation of two active Administrators proves at least one remains active and the losing write returns `LAST_ACTIVE_ADMINISTRATOR` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-U04 | API | AC-09, BR-08, BR-15 | Reset password revokes sessions, forces next-login change, never returns password/hash | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| MIG-01 | Migration | AC-11, BR-03, BR-17, specification §9 | Upgraded Lab 2 fixture retains User/Ticket IDs and numbers/requester links, Attachment IDs/metadata/files/uploader/remover links, and copied IT Priority. For a legacy Requester with no credential hash, use exact `TokTickIT123!` from specification §9 as seed input, provision a non-null bcrypt cost-12 hash verified by bcrypt comparison, and set `mustChangePassword = true`; then directly write a changed bcrypt hash plus `mustChangePassword = false` in the fixture/database and prove repeat migration/seed preserves the exact established hash/state and historical data. No HTTP route calls and no password/hash output or logging. | `server/tests/lab-03/migration-seed.regression.test.ts` | Planned |
| MIG-02 | Migration | AC-11, AC-12, BR-03, specification §9 | Fresh/upgraded migration and repeat seed create the required account distribution/workflow fixtures with no duplicate rows; after the direct changed-state setup, repeat migration/seed preserves the User, exact established credential/hash, `mustChangePassword = false`, and historical Ticket/Attachment IDs, identity/ownership/files. No HTTP authentication lifecycle or Lab 1/Lab 2 regression manifest is executed here, and no password/hash value is returned or logged. | `server/tests/lab-03/migration-seed.regression.test.ts` | Planned |
| REG-01 | Regression manifest | AC-04, AC-12, BR-29 | Issue 7's sole regression owner executes exactly the existing Lab 1/Lab 2 server/client suites named in §5 against the migrated schema; only authenticated identity setup and obsolete Development Requester selector/`X-Requester-Id` expectations are intentionally adapted. Migration assertions remain owned by MIG-01/MIG-02, not this ID. | Exact existing paths in §5, `REG-01 legacy manifest` | Planned |

### 2.5 React component, style, and responsive tests

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| UI-L01 | UI/style | AC-01, AC-10 | Login labels, validation, busy, safe invalid/inactive/throttle/failure feedback, no insecure controls | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-L02 | UI/style | AC-02, AC-10 | Mandatory Change Password gate, rules/confirmation, busy/success, clear password inputs, focus/ARIA | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-H01 | UI | AC-01, AC-02, AC-03, AC-10 | App-shell reload hydrates `/me` CSRF state, Role navigation/direct-route guards, mandatory-change shell, Logout, and safe failures | `client/tests/lab-03/AppShell.test.tsx` | Planned |
| UI-R01 | UI/style | AC-04, AC-05, AC-10, BR-25, BR-32, BR-33 | Authenticated Requester regression/no selector; credentialed `FormData` upload with CSRF and no manual multipart boundary; malicious Comment text such as `<img src=x onerror=alert(1)>` is displayed literally with no created image/script/event-capable DOM node; Public Comment remains available on `RESOLVED` while Resolution Indication is unavailable; Final history/read-only and attachment terminal state; responsive representation classes | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Planned |
| UI-Q01 | UI/style | AC-06, AC-10, BR-30 | Queue query/URL state; safe eligible-Owner directory loading/retry/forbidden and `id` filter wiring without visible-row/Admin-User inference; reset page, rows/cards, badges/indication, all loading/empty/no-results/forbidden/failure/pagination states | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-Q02 | Responsive | AC-10 | Desktop seven-column/table and smaller-card representation classes, labels and no overflow guards | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-S01 | UI/style | AC-07, AC-08, AC-10, BR-19, BR-30, BR-31 | Claim/Reassign captures `expectedOwnerId` with safe eligible-Owner directory loading/retry and no Admin-User/visible-owner inference; `TICKET_OWNER_CHANGED` refreshes owner and requires explicit retry; IT Priority, allowed transitions/dialogs/Waiting Comment, Final response takes precedence over local field feedback, terminal read-only | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-S02 | UI/style | AC-05, AC-07, AC-10, BR-25, BR-31 | Public/Internal composer separation, malicious Public Comment and Internal Note markup rendered literally with no created HTML/event-capable DOM node, `RESOLVED` comment/note availability, indication, Attachment download-only, Final response takes precedence over local composer validation, action-specific busy/error/success, accessibility | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-U01 | UI/style | AC-09, AC-10 | User list/search/Role-and-active-status filters, AND query wiring, create/edit/reset, validation, password non-repopulation, own-name/email, Admin-to-Staff eligible-owner success, and self/last-admin/owned-Ticket conflict messaging | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-U02 | Responsive | AC-09, AC-10 | User table/card representation, dialog focus/return focus, forbidden navigation and feedback states | `client/tests/lab-03/UserManagement.test.tsx` | Planned |

### 2.6 End-to-end, direct security, and screenshot evidence

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| E2E-A01 | E2E/security | AC-01, AC-02, AC-03, AC-04, AC-10 | Valid/invalid/inactive Login, first change, Role landing/navigation, Logout/direct access blocked, direct authorization/CSRF checks | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-S01 | E2E | AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, BR-19, BR-30-BR-33 | Requester/staff flow: safe eligible-Owner directory drives Queue filter and Reassign; stale Reassign refreshes current ownership rather than overwriting; queue Search/filter/sort/page, Claim/Reassign, IT Priority, status edges/Waiting comment and indication clearing on `RESOLVED -> REOPENED`, Public Comments and Internal Notes on `RESOLVED`, configured-origin browser Attachment upload/removal, indication, and Final-over-invalid attachment/priority/status/comment/note feedback | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-U01 | E2E | AC-09, AC-10 | Admin list/search/Role-and-active-status filtering with visible-row assertions, create/duplicate/edit/activate/deactivate/reset/next-login change, Admin-to-Staff eligible-owner edit, self+last-admin protections/non-Admin rejection | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-R01 | Responsive/evidence | AC-10, AC-12 | Login, shell, Requester Ticket Detail, Staff Queue, Staff Ticket Detail, and User Management at 1440x900/820x1024/390x844; assert no page overflow/clipping/overlap; capture only the four required artifact groups | `e2e/lab-03/capture.screens.ts` | Planned |

### 2.7 Documentation and evidence completion

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| EVD-D01 | Evidence audit | AC-12 | Reviewer identity, Issue/PR links, comments/responses/approval, and Kanban/release evidence are complete and truthful | `docs/lab-03/reviewer.md` | Planned |
| EVD-D02 | Evidence audit | AC-12 | Selected 6-10 AI prompts name the LLM and retain the student's own reflection section | `docs/lab-03/ai-use.md` | Planned |
| EVD-D03 | Traceability audit | AC-12 | Every FR/BR/AC maps to Test ID and exact path; final results contain main-branch command totals | `docs/lab-03/tests.md` | Planned |

## 3. Acceptance-criterion traceability

| AC | Test IDs | Exact planned file(s) |
| --- | --- | --- |
| AC-01 | UNIT-A01, UNIT-A02, API-A01, API-A02, API-A03, UI-L01, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| AC-02 | UNIT-A01, API-A03, UI-L02, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| AC-03 | API-Z01, API-Z02, API-Z03, API-Z04, API-AT01, UI-H01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| AC-04 | API-Z02, API-R01, API-AT01, API-M01, REG-01, UI-R01, E2E-A01, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/requester-regression.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; REG-01 legacy manifest in §5; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-05 | API-Z03, API-C02, API-C03, API-C04, API-M01, UI-R01, UI-S02, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-06 | API-Q01, API-Q02, API-Q03, UI-Q01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-07 | API-S01, API-S02, API-S03, API-S04, API-M01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-08 | API-S02, API-S03, API-S04, API-M01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-09 | API-U01, API-U02, API-U03, API-U04, UI-U01, UI-U02, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| AC-10 | UI-L01, UI-L02, UI-H01, UI-R01, UI-Q01, UI-Q02, UI-S01, UI-S02, UI-U01, UI-U02, E2E-A01, E2E-S01, E2E-U01, E2E-R01 | `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts`; `e2e/lab-03/user-administration.spec.ts`; `e2e/lab-03/capture.screens.ts` |
| AC-11 | MIG-01, MIG-02 | `server/tests/lab-03/migration-seed.regression.test.ts` |
| AC-12 | E2E-R01, MIG-02, REG-01, EVD-D01, EVD-D02, EVD-D03 | `e2e/lab-03/capture.screens.ts`; `server/tests/lab-03/migration-seed.regression.test.ts`; REG-01 exact legacy server/client manifest in §5; `docs/lab-03/reviewer.md`; `docs/lab-03/ai-use.md`; `docs/lab-03/tests.md` |

## 4. Full FR/BR -> AC -> Test-ID traceability

Each row is a complete implementation chain. Exact file paths are repeated here so a requirement is traceable without inferring from a test-ID prefix.

| Requirement | AC | Test ID | Exact file |
| --- | --- | --- | --- |
| FR-01 | AC-01 | UNIT-A02, API-A01, API-A03, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-02 | AC-01, AC-02 | API-A03, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-03 | AC-01, AC-02 | UNIT-A01, API-A03, UI-L02, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-04 | AC-10 | UI-H01, E2E-A01 | `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-05 | AC-03 | API-Z01, API-Z02, API-Z03, API-Z04, UI-H01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-06 | AC-04 | API-Z02, API-R01, API-AT01, API-M01, REG-01, UI-R01, E2E-A01, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/requester-regression.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; REG-01 legacy manifest in §5; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-07 | AC-05 | API-C02, API-M01, UI-R01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-08 | AC-05 | API-C03, API-M01, UI-R01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-09 | AC-06 | API-Q01, API-Q02, API-Q03, UI-Q01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-10 | AC-07 | API-S01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-11 | AC-07, AC-08 | API-S02, API-M01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-12 | AC-07, AC-08 | API-S03, API-M01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-13 | AC-08 | API-S04, API-M01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-14 | AC-05, AC-07 | API-C02, API-C04, API-M01, UI-S02, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-15 | AC-09 | API-U01, UI-U01, UI-U02, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| FR-16 | AC-09 | API-U02, API-U03, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| FR-17 | AC-09 | API-U04, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| FR-18 | AC-10 | UI-L01, UI-L02, UI-H01, UI-R01, UI-Q01, UI-S01, UI-S02, UI-U01, UI-U02, E2E-A01, E2E-S01, E2E-U01 | `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts`; `e2e/lab-03/user-administration.spec.ts` |
| FR-19 | AC-10 | UI-L01, UI-L02, UI-H01, UI-R01, UI-Q01, UI-Q02, UI-S01, UI-S02, UI-U01, UI-U02, E2E-R01 | `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/capture.screens.ts` |
| FR-20 | AC-11, AC-12 | MIG-01, MIG-02, REG-01 | `server/tests/lab-03/migration-seed.regression.test.ts`; REG-01 exact legacy server/client manifest in §5 |
| FR-21 | AC-06, AC-07 | API-Q03, UI-Q01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-01 | AC-01 | API-A01, API-A02 | `server/tests/lab-03/auth.api.test.ts` |
| BR-02 | AC-01, AC-09 | API-A01, API-U02, API-U03 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts` |
| BR-03 | AC-01, AC-09, AC-11 | UNIT-A02, API-A01, API-U01, MIG-01, MIG-02 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts`; `server/tests/lab-03/migration-seed.regression.test.ts` |
| BR-04 | AC-01, AC-02, AC-09 | UNIT-A01, API-A01, API-U02 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts` |
| BR-05 | AC-01 | API-A02 | `server/tests/lab-03/auth.api.test.ts` |
| BR-06 | AC-01 | UNIT-A02, API-A01, API-A02 | `server/tests/lab-03/auth.api.test.ts` |
| BR-07 | AC-01, AC-02 | UNIT-A02, API-A03 | `server/tests/lab-03/auth.api.test.ts` |
| BR-08 | AC-02, AC-09 | API-A03, API-U03, API-U04 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts` |
| BR-09 | AC-01, AC-02, AC-03 | UNIT-A02, API-A01, API-A03, API-Z01, API-AT01 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts` |
| BR-10 | AC-01, AC-02, AC-10 | API-A03, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| BR-11 | AC-09 | API-U01, API-U02, API-U03 | `server/tests/lab-03/users-admin.api.test.ts` |
| BR-12 | AC-09 | API-U03, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| BR-13 | AC-09 | API-U03, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| BR-14 | AC-09 | API-U03, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| BR-15 | AC-09 | API-U02, API-U03, API-U04, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| BR-16 | AC-03, AC-04 | API-Z02, API-R01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/requester-regression.api.test.ts`; `e2e/lab-03/authentication.spec.ts` |
| BR-17 | AC-04, AC-07, AC-11 | API-R01, API-S03, UI-S01, E2E-S01, MIG-01 | `server/tests/lab-03/requester-regression.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts`; `server/tests/lab-03/migration-seed.regression.test.ts` |
| BR-18 | AC-07, AC-08 | API-S01, API-S02, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-19 | AC-07, AC-08 | API-S02, API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-20 | AC-04, AC-05, AC-07, AC-08 | API-C02, API-C04, API-S02, API-S03, API-S04, API-M01, UI-R01, UI-S01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-21 | AC-08 | API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-22 | AC-08 | API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-23 | AC-03, AC-05 | API-Z03, API-C02, API-C04, UI-R01, UI-S02, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-24 | AC-05, AC-07, AC-08 | API-C02, API-C03, API-C04, API-S02, API-S03, API-S04, UI-R01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-25 | AC-03, AC-04, AC-05, AC-07 | API-Z01, API-Z04, API-C02, API-C04, API-S02, UI-R01, UI-S02 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx` |
| BR-26 | AC-04 | API-Z02, API-R01, API-AT01, UI-R01, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/requester-regression.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-27 | AC-06 | API-Q01, API-Q02, API-Q03, UI-Q01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-28 | AC-03 | API-Z01, API-Z03, UI-H01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| BR-29 | AC-04, AC-12 | API-R01, API-AT01, REG-01 | `server/tests/lab-03/requester-regression.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; REG-01 exact legacy server/client manifest in §5 |
| BR-30 | AC-06, AC-07 | API-Q03, UI-Q01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-31 | AC-03, AC-04, AC-05, AC-07, AC-08 | API-Z01, API-AT01, API-C02, API-C04, API-S02, API-S03, API-S04, API-M01, UI-R01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-32 | AC-03, AC-04 | API-AT01, UI-R01, E2E-S01 | `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-33 | AC-03, AC-04 | API-AT01, UI-R01, E2E-S01 | `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-34 | AC-04, AC-05, AC-07, AC-08 | API-C03, API-S02, API-S03, API-S04, API-M01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/ticket-mutation-concurrency.api.test.ts` |
| BR-35 | AC-07, AC-09 | API-S02, API-U03 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts` |

## 5. Required paths and test commands

The contract requires the following implementation and evidence paths. They are listed for traceability; in the current integrated worktree the required implementation files, screenshots, `reviewer.md`, and `ai-use.md` have been checked and exist.

```text
server/tests/lab-03/auth.api.test.ts
server/tests/lab-03/authorization.api.test.ts
server/tests/lab-03/staff-queue.api.test.ts
server/tests/lab-03/staff-ticket-detail.api.test.ts
server/tests/lab-03/ticket-mutation-concurrency.api.test.ts
server/tests/lab-03/comments-notes.api.test.ts
server/tests/lab-03/requester-regression.api.test.ts
server/tests/lab-03/attachments.api.test.ts
server/tests/lab-03/users-admin.api.test.ts
server/tests/lab-03/migration-seed.regression.test.ts
client/tests/lab-03/Login.test.tsx
client/tests/lab-03/ChangePassword.test.tsx
client/tests/lab-03/AppShell.test.tsx
client/tests/lab-03/RequesterTicketDetail.test.tsx
client/tests/lab-03/StaffTicketQueue.test.tsx
client/tests/lab-03/StaffTicketDetail.test.tsx
client/tests/lab-03/UserManagement.test.tsx
e2e/lab-03/authentication.spec.ts
e2e/lab-03/staff-ticket-flow.spec.ts
e2e/lab-03/user-administration.spec.ts
e2e/lab-03/capture.screens.ts
docs/lab-03/reviewer.md
docs/lab-03/ai-use.md
```

`REG-01`, owned and executed only by Issue 7, owns this exact existing legacy server/client regression manifest; it does not claim migration assertions (MIG-01/MIG-02 own those) or Lab 2 E2E/screenshot capture:

```text
server/tests/lab-01/health.test.ts
server/tests/lab-01/categories.test.ts
server/tests/lab-02/create-ticket.api.test.ts
server/tests/lab-02/my-tickets.api.test.ts
server/tests/lab-02/ticket-detail.api.test.ts
server/tests/lab-02/attachments.api.test.ts
client/tests/lab-01/App.test.tsx
client/tests/lab-02/AppShell.test.tsx
client/tests/lab-02/SelectRequester.test.tsx
client/tests/lab-02/CreateTicket.test.tsx
client/tests/lab-02/MyTickets.test.tsx
client/tests/lab-02/RequesterTicketDetail.test.tsx
client/tests/lab-02/AttachmentSection.test.tsx
```

The final results recorded in §6 are the exact observed totals from the post-PR #80 integrated `lab3-staging` state at merge commit `7db4e1d`, exercised with the uncommitted Issue #81 reproducibility changes in this worktree. A repeat verification on the released `main` branch is still pending release integration, so this document does not claim that `main` has been verified yet:

```bash
# Fresh and upgraded database migration/seed regression
cd server && npx prisma migrate deploy && npx prisma db seed && npm test

# React component and UI-style coverage
cd client && npm test

# Browser, direct authorization, responsive, and screenshot evidence
npx playwright test
npx playwright test --project=screenshots
```

## 6. Final results and evidence checklist

Evidence source: integrated `lab3-staging` at merge commit `7db4e1d`, which contains merged PR [#80](https://github.com/FramePongrit/toktickit/pull/80), plus the uncommitted Issue #81 changes in branch `feature/18-release-reproducibility`. The bounded runner used isolated task-owned PostgreSQL schemas and ports `3001`/`5174`; screenshots were written to ignored `test-results/issue81-screenshots-6e5686558f824378b9023f75136d3dc4/` and committed artifacts were not overwritten.

| Command | Exact observed result |
| --- | --- |
| `e2e/run-issue61-full.ps1 -ApiPort 3001 -ClientPort 5174` | All bounded verification steps passed: isolated server suite **16 files / 197 tests**, client suite **14 files / 150 tests**, fresh/upgraded migration regression **3/3**, Lab 3 authenticated E2E **7/7**, legacy authenticated E2E **1/1**, and safe screenshot suite **4/4**. Both task-owned schemas were dropped and the cleanup assertion reported **0** remaining `issue61_verify_*` schemas. |
| `cd server && npm test` through the bounded isolated runner | **16 test files, 197 tests passed** on the first task-owned schema. |
| `cd client && npm test` through the bounded runner | **14 test files, 150 tests passed**. |
| `cd server && npm run test:migration` through the bounded runner | Fresh/upgraded migration regression **3/3 passed**; its own disposable migration schemas and fixture file were cleaned by the suite. |
| `e2e/run-issue61.ps1` browser steps through the bounded runner | Lab 3 authenticated E2E **7/7 passed**, legacy authenticated E2E **1/1 passed**, and responsive screenshot capture **4/4 passed**. |
| Safe screenshot and repository checks | 15 screenshot PNGs were generated under ignored `test-results/issue81-screenshots-6e5686558f824378b9023f75136d3dc4/`; `git diff --check` passed and `git diff --name-only -- artifacts` was empty. |

No password, bcrypt hash, JWT, CSRF token, or server secret was emitted in the captured verification evidence. The runner used disposable `issue61_verify_*` schemas, validated the public/omitted base schema without writing test fixtures there, and did not reset, drop, or mutate the public schema.

## 7. Visual, path, and safety audit

### Visual audit

All 15 tracked PNGs under `artifacts/lab-03/screenshots/` were inspected at normal zoom:

- `authentication/`: desktop, tablet, mobile Login captures.
- `staff-queue/`: desktop table plus tablet/mobile card representations.
- `staff-ticket-detail/`: desktop, tablet, mobile Staff Detail and Requester Ticket Detail captures.
- `user-management/`: desktop, tablet, and mobile Create User dialog capture.

The required viewport widths are represented by 1440, 820, and 390 pixels. Full-page screenshot heights vary with content length. The inspected evidence showed readable text, distinct Zen Green/priority/status/Role badges, visible primary actions, separated Public/Internal communication cards, responsive cards at smaller widths, and no evidence-blocking clipping, overlap, unreadable grid, inaccessible dialog, or page-level horizontal overflow. No production-code fix was required for this documentation pass.

### Required paths and links

- [Issue #62](https://github.com/FramePongrit/toktickit/issues/62) is linked from `docs/lab-03/issue-plan.md`.
- [Issue #81](https://github.com/FramePongrit/toktickit/issues/81) tracks clean-checkout release reproducibility; it remains **Open / Backlog** while these changes are uncommitted.
- The required Lab 3 E2E files exist under `e2e/lab-03/`.
- All 15 required Lab 3 screenshot files exist under the four required artifact groups.
- `docs/lab-03/reviewer.md` and `docs/lab-03/ai-use.md` record the merged PR #80 review and AI-use history; this Issue #81 verification update is still uncommitted.
- Cross-document links to `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md` resolve as repository-relative Markdown paths.

### Repository safety audit

`.gitignore` excludes `.env` files except `.env.example`, dependency/build folders, Playwright runtime output, Prisma local database files, and the contents of `server/uploads/` while retaining only its `.gitkeep`. The tracked-file audit found no tracked real `.env`, dependency folder, runtime upload, build output, private key, or production secret. The documented `TokTickIT123!` value is explicitly a local-only seed/test fixture in the approved specification and README, not a production credential.
