# Lab 3 Test-Driven Delivery Plan

**Status:** Planned before implementation. `Final` is intentionally `Planned` until integrated-branch evidence is recorded.
**Related documents:** [specification](./specification.md) · [API contract](./api-spec.md) · [UI specification](./ui-spec.md)

## 1. Test strategy and isolation

Tests are specified before the feature PRs. Each server test uses isolated, deterministic fixture Users/Tickets and removes only rows/files it creates; migration tests run both a fresh schema and an upgraded Lab 2 fixture. Database clock/randomness/throttle storage are injectable for deterministic auth/expiry/race tests. Existing Lab 1/Lab 2 test files remain unmodified as regression evidence. Server suites remain sequential while sharing the configured local database, as documented in Lab 2.

All security/authorization assertions call the API directly in addition to hiding/disabling UI controls. Every mutation test supplies a valid session-bound CSRF token unless it is specifically testing its absence/mismatch. No test output logs a password, hash, JWT, CSRF value, or server secret.

## 2. Planned automated tests

### 2.1 Authentication and authorization

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| UNIT-A01 | Unit | AC-01, AC-02, BR-03, BR-04 | Password boundaries, letter/digit rule, confirmation and no-current-password reuse | `server/tests/lab-03/auth.api.test.ts` | Planned |
| UNIT-A02 | Unit | AC-01, BR-03, BR-06-BR-09 | bcrypt cost, JWT signature/expiry, session revocation, fixed-session CSRF generation/validation/invalidation, cookie and `Cache-Control: no-store` attributes, throttle window | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-A01 | API | AC-01, BR-01-BR-06 | Valid active Login returns SafeUser/cookie/CSRF; generic unknown/wrong credential failures | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-A02 | API | AC-01, BR-01, BR-05 | Inactive after valid credential and throttle behavior; no cookie or account leakage | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-A03 | API | AC-01, AC-02, BR-07-BR-10 | `me` reload bootstrap returns same-session token with `no-store`; mandatory-password route/API gate; password change revokes prior sessions and returns a new token; Logout requires token and blocks reuse | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-Z01 | API | AC-03, BR-09, BR-28, BR-31 | Unparseable JSON returns generic transport `400` before application guards; missing/forged/expired/revoked/orphaned JWT; Mandatory Password Change/Role/CSRF failures run before Ticket resource/domain work; Role/current active state re-read from DB | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-Z02 | API | AC-03, AC-04, BR-16, BR-26 | Requester cannot access another Ticket/Attachment (404), cannot spoof requesterId, and Staff/Admin/Requester route boundaries | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-Z03 | API | AC-03, AC-05, BR-23, BR-28 | Requester direct Internal Note access is forbidden with no note representation; User-management direct access denied to non-Admin | `server/tests/lab-03/authorization.api.test.ts` | Planned |

### 2.2 Comments, notes, Requester continuation

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| API-C01 | API | AC-04, BR-29 | Authenticated Requester preserves Lab 2 create/list/detail/Attachment owner behavior; selector endpoint absent | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-AT01 | API/CORS | AC-03, AC-04, BR-09, BR-26, BR-29, BR-31-BR-33 | Exact configured-origin credentialed CORS/preflight permits JSON and multipart `FormData` with `X-CSRF-Token` but not arbitrary Origin or hard-coded boundary; malformed multipart `400` and streamed >5 MB `413` occur before domain guards with no temp file/row; parsed upload/remove guard order, Final+invalid upload/removal, type/count/`NO_FILE`, `ALREADY_REMOVED`, safe ownership `404`, and every rejection/database/filesystem failure leaves no orphan file or row | `server/tests/lab-03/attachments.api.test.ts` | Planned |
| API-C02 | API | AC-05, BR-23-BR-25, BR-31 | Public Comment visibility/author/time/plain-text boundaries; appends succeed on `RESOLVED`; Final Ticket history reads succeed while Final plus invalid/blank/over-limit body returns `409 TICKET_FINAL` before validation | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-C03 | API | AC-05, AC-08, BR-24 | Requester Resolution Indication records once, changes no status, rejects duplicate/Resolved/final; Reopened clears it | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-C04 | API | AC-05, BR-23, BR-24, BR-31 | Internal Note Staff/Admin-only retrieval/create, append-only validation/author/time, `RESOLVED` append success, Final history read and Final plus invalid/blank/over-limit post returns `409 TICKET_FINAL`, no Requester data leak | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |

### 2.3 Queue and Staff Ticket operations

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| API-Q01 | API | AC-06, BR-27 | Role denial; search each documented field; each filter alone and AND combinations | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-Q02 | API | AC-06, BR-27, D-05 | Default Active scope/order; every `itPriority`/`createdAt`/`updatedAt`/`ticketNumber`/status sort direction with exact secondary/final tie keys; All scope and page boundaries | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-Q03 | API | AC-06, BR-27, BR-30 | `GET /api/staff/ticket-owners` allows Staff/Admin, returns every active eligible Owner even without Tickets in `LOWER(fullName), id` order and exactly safe fields; Owner modes (me/unassigned/id), non-eligible numeric Owner safe field validation, 10/20/50 pagination, empty metadata, invalid query field errors/no clamping | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-S01 | API | AC-07, BR-18-BR-19 | Staff Detail Role access, permitted attachments download-only, Requester denied Staff view | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-S02 | API | AC-07, AC-08, BR-18-BR-20, BR-24, BR-25, BR-31 | Concurrent Claim has exactly one success/one 409; Final Ticket guard wins over already-assigned/invalid Owner target; Reassign of an Unassigned Ticket returns `409 TICKET_UNASSIGNED` and requires Claim before payload/target checks; only then validate malformed id; absent, inactive, and Requester targets return identical `409 OWNER_NOT_ELIGIBLE` status/code/body with no metadata | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-S03 | API | AC-07, AC-08, BR-17, BR-24, BR-31 | IT Priority update is independent/Role-protected; Requested Priority immutable; Final plus invalid IT Priority returns `409 TICKET_FINAL`, while only a Non-final invalid enum returns `400 VALIDATION_FAILED` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-S04 | API | AC-07, AC-08, BR-19-BR-22, BR-24, BR-31 | Every allowed status edge succeeds; Final plus invalid status or Waiting Comment returns `409 TICKET_FINAL`; Non-final missing/ineligible Owner precedes status/body validation; every absent edge/invalid body then fails; Waiting comment transaction commits atomically; indications clear on Reopened; terminal finality | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |

### 2.4 Administrator and migration/regression

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| API-U01 | API | AC-09, BR-11, BR-15 | Admin list/search/one Role filter ordering; non-Admin denial; safe representation has no sensitive fields | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-U02 | API | AC-09, BR-02-BR-04, BR-11, BR-15 | Create with each Role/active state, normalized duplicate email, invalid Role/password, initial mandatory change | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-U03 | API | AC-09, BR-12-BR-15 | Edit/activate/deactivate/Role change/revoke sessions; own name/email succeeds while own Role/active state is rejected; `ADMIN` to `STAFF` succeeds with owned Non-final Tickets; deactivation/Role-to-Requester, self reset, last active Admin, and owned-Ticket conflicts; Final historical Owner allowed | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-U04 | API | AC-09, BR-08, BR-15 | Reset password revokes sessions, forces next-login change, never returns password/hash | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| MIG-01 | Migration | AC-11, D-03 | Upgraded Lab 2 fixture retains User IDs, Ticket IDs/numbers/requester links, Attachment metadata/files/uploader/remover links; IT Priority copied | `server/tests/lab-03/migration-seed.regression.test.ts` | Planned |
| MIG-02 | Migration | AC-11, AC-12, specification §9 | Fresh/upgraded migration and repeat seed: required account distribution/workflow fixtures, no duplicate rows, no password reset | `server/tests/lab-03/migration-seed.regression.test.ts` | Planned |
| REG-01 | Regression | AC-04, AC-11, AC-12, BR-29 | All Lab 1/Lab 2 server and client test files run against migrated schema; Lab 2 selector expectations are replaced only by Lab 3 contract tests | `server/tests/lab-03/migration-seed.regression.test.ts` | Planned |

### 2.5 React component, style, and responsive tests

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| UI-L01 | UI/style | AC-01, AC-10 | Login labels, validation, busy, safe invalid/inactive/throttle/failure feedback, no insecure controls | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-L02 | UI/style | AC-02, AC-10 | Mandatory Change Password gate, rules/confirmation, busy/success, clear password inputs, focus/ARIA | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-H01 | UI | AC-01, AC-02, AC-03, AC-10 | App-shell reload hydrates `/me` CSRF state, Role navigation/direct-route guards, mandatory-change shell, Logout, and safe failures | `client/tests/lab-03/AppShell.test.tsx` | Planned |
| UI-R01 | UI/style | AC-04, AC-05, AC-10, BR-32, BR-33 | Authenticated Requester regression/no selector; credentialed `FormData` upload with CSRF and no manual multipart boundary; Public Comment remains available on `RESOLVED` while Resolution Indication is unavailable; Final history/read-only and attachment terminal state; responsive representation classes | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Planned |
| UI-Q01 | UI/style | AC-06, AC-10, BR-30 | Queue query/URL state; safe eligible-Owner directory loading/retry/forbidden and `id` filter wiring without visible-row/Admin-User inference; reset page, rows/cards, badges/indication, all loading/empty/no-results/forbidden/failure/pagination states | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-Q02 | Responsive | AC-10 | Desktop seven-column/table and smaller-card representation classes, labels and no overflow guards | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-S01 | UI/style | AC-07, AC-08, AC-10, BR-30, BR-31 | Claim/Reassign with safe eligible-Owner directory loading/retry and no Admin-User/visible-owner inference; IT Priority, allowed transitions/dialogs/Waiting Comment, conflict refresh, Final response takes precedence over local field feedback, terminal read-only | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-S02 | UI/style | AC-05, AC-07, AC-10, BR-31 | Public/Internal composer separation, `RESOLVED` comment/note availability, indication, Attachment download-only, Final response takes precedence over local composer validation, action-specific busy/error/success, accessibility | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-U01 | UI/style | AC-09, AC-10 | User list/search/filter/create/edit/reset, validation, password non-repopulation, own-name/email, Admin-to-Staff eligible-owner success, and self/last-admin/owned-Ticket conflict messaging | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-U02 | Responsive | AC-09, AC-10 | User table/card representation, dialog focus/return focus, forbidden navigation and feedback states | `client/tests/lab-03/UserManagement.test.tsx` | Planned |

### 2.6 End-to-end, direct security, and screenshot evidence

| Test ID | Type | Requirement / AC | Planned assertion | Exact file | Final |
| --- | --- | --- | --- | --- | --- |
| E2E-A01 | E2E/security | AC-01, AC-02, AC-03, AC-04, AC-10 | Valid/invalid/inactive Login, first change, Role landing/navigation, Logout/direct access blocked, direct authorization/CSRF checks | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-S01 | E2E | AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, BR-30-BR-33 | Requester/staff flow: safe eligible-Owner directory drives Queue filter and Reassign, queue Search/filter/sort/page, Claim/Reassign, IT Priority, status edges/Waiting comment, Public Comments and Internal Notes on `RESOLVED`, configured-origin browser Attachment upload/removal, indication, and Final-over-invalid attachment/priority/status/comment/note feedback | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-U01 | E2E | AC-09, AC-10 | Admin list/search/filter/create/duplicate/edit/activate/reset/next-login change, Admin-to-Staff eligible-owner edit, self+last-admin protections/non-Admin rejection | `e2e/lab-03/user-administration.spec.ts` | Planned |
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
| AC-03 | API-Z01, API-Z02, API-Z03, API-AT01, UI-H01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| AC-04 | API-Z02, API-C01, API-AT01, REG-01, UI-R01, E2E-A01, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/migration-seed.regression.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-05 | API-Z03, API-C02, API-C03, API-C04, UI-R01, UI-S02, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-06 | API-Q01, API-Q02, API-Q03, UI-Q01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-07 | API-S01, API-S02, API-S03, API-S04, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-08 | API-C03, API-S02, API-S03, API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| AC-09 | API-U01, API-U02, API-U03, API-U04, UI-U01, UI-U02, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| AC-10 | UI-L01, UI-L02, UI-H01, UI-R01, UI-Q01, UI-Q02, UI-S01, UI-S02, UI-U01, UI-U02, E2E-A01, E2E-S01, E2E-U01, E2E-R01 | `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts`; `e2e/lab-03/user-administration.spec.ts`; `e2e/lab-03/capture.screens.ts` |
| AC-11 | MIG-01, MIG-02, REG-01 | `server/tests/lab-03/migration-seed.regression.test.ts` |
| AC-12 | E2E-R01, MIG-02, REG-01, EVD-D01, EVD-D02, EVD-D03 | `e2e/lab-03/capture.screens.ts`; `server/tests/lab-03/migration-seed.regression.test.ts`; `docs/lab-03/reviewer.md`; `docs/lab-03/ai-use.md`; `docs/lab-03/tests.md` |

## 4. Full FR/BR -> AC -> Test-ID traceability

Each row is a complete implementation chain. Exact file paths are repeated here so a requirement is traceable without inferring from a test-ID prefix.

| Requirement | AC | Test ID | Exact file |
| --- | --- | --- | --- |
| FR-01 | AC-01 | UNIT-A02, API-A01, API-A03, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-02 | AC-01, AC-02 | API-A03, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-03 | AC-01, AC-02 | UNIT-A01, API-A03, UI-L02, UI-H01, E2E-A01 | `server/tests/lab-03/auth.api.test.ts`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-04 | AC-10 | UI-H01, E2E-A01 | `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-05 | AC-03 | API-Z01, API-Z02, API-Z03, UI-H01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| FR-06 | AC-04 | API-Z02, API-C01, API-AT01, REG-01, UI-R01, E2E-A01, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/migration-seed.regression.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-07 | AC-05 | API-C02, UI-R01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-08 | AC-05 | API-C03, UI-R01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-09 | AC-06 | API-Q01, API-Q02, API-Q03, UI-Q01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-10 | AC-07 | API-S01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-11 | AC-07, AC-08 | API-S02, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-12 | AC-07, AC-08 | API-S03, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-13 | AC-08 | API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-14 | AC-05, AC-07 | API-C02, API-C04, UI-S02, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| FR-15 | AC-09 | API-U01, UI-U01, UI-U02, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| FR-16 | AC-09 | API-U02, API-U03, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| FR-17 | AC-09 | API-U04, UI-U01, E2E-U01 | `server/tests/lab-03/users-admin.api.test.ts`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/user-administration.spec.ts` |
| FR-18 | AC-10 | UI-L01, UI-L02, UI-H01, UI-R01, UI-Q01, UI-S01, UI-S02, UI-U01, UI-U02, E2E-A01, E2E-S01, E2E-U01 | `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/authentication.spec.ts`; `e2e/lab-03/staff-ticket-flow.spec.ts`; `e2e/lab-03/user-administration.spec.ts` |
| FR-19 | AC-10 | UI-L01, UI-L02, UI-H01, UI-R01, UI-Q01, UI-Q02, UI-S01, UI-S02, UI-U01, UI-U02, E2E-R01 | `client/tests/lab-03/Login.test.tsx`; `client/tests/lab-03/ChangePassword.test.tsx`; `client/tests/lab-03/AppShell.test.tsx`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `client/tests/lab-03/UserManagement.test.tsx`; `e2e/lab-03/capture.screens.ts` |
| FR-20 | AC-11, AC-12 | MIG-01, MIG-02, REG-01 | `server/tests/lab-03/migration-seed.regression.test.ts` |
| FR-21 | AC-06, AC-07 | API-Q03, UI-Q01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-01 | AC-01 | API-A01, API-A02 | `server/tests/lab-03/auth.api.test.ts` |
| BR-02 | AC-01, AC-09 | API-A01, API-U02, API-U03 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts` |
| BR-03 | AC-01, AC-09 | UNIT-A02, API-A01, API-U01 | `server/tests/lab-03/auth.api.test.ts`; `server/tests/lab-03/users-admin.api.test.ts` |
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
| BR-16 | AC-03, AC-04 | API-Z02, API-C01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `e2e/lab-03/authentication.spec.ts` |
| BR-17 | AC-07, AC-08 | API-S03, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-18 | AC-07, AC-08 | API-S01, API-S02, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-19 | AC-07, AC-08 | API-S02, API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-20 | AC-05, AC-07, AC-08 | API-C02, API-C04, API-S02, API-S03, API-S04, UI-R01, UI-S01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-21 | AC-08 | API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-22 | AC-05, AC-08 | API-C03, API-S04, UI-S01, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-23 | AC-03, AC-05 | API-Z03, API-C02, API-C04, UI-R01, UI-S02, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-24 | AC-05, AC-07, AC-08 | API-C02, API-C03, API-C04, API-S02, API-S03, API-S04, UI-R01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-25 | AC-03, AC-05, AC-07 | API-Z01, API-C02, API-C04, API-S02 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| BR-26 | AC-04 | API-Z02, API-C01, API-AT01, UI-R01, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-27 | AC-06 | API-Q01, API-Q02, API-Q03, UI-Q01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-28 | AC-03 | API-Z01, API-Z03, UI-H01, E2E-A01 | `server/tests/lab-03/authorization.api.test.ts`; `client/tests/lab-03/AppShell.test.tsx`; `e2e/lab-03/authentication.spec.ts` |
| BR-29 | AC-04, AC-11, AC-12 | API-C01, API-AT01, REG-01 | `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/migration-seed.regression.test.ts` |
| BR-30 | AC-06, AC-07 | API-Q03, UI-Q01, UI-S01, E2E-S01 | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-31 | AC-03, AC-04, AC-05, AC-07, AC-08 | API-Z01, API-AT01, API-C02, API-C04, API-S02, API-S03, API-S04, UI-R01, UI-S01, UI-S02, E2E-S01 | `server/tests/lab-03/authorization.api.test.ts`; `server/tests/lab-03/attachments.api.test.ts`; `server/tests/lab-03/comments-notes.api.test.ts`; `server/tests/lab-03/staff-ticket-detail.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `client/tests/lab-03/StaffTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-32 | AC-03, AC-04 | API-AT01, UI-R01, E2E-S01 | `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |
| BR-33 | AC-03, AC-04 | API-AT01, UI-R01, E2E-S01 | `server/tests/lab-03/attachments.api.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx`; `e2e/lab-03/staff-ticket-flow.spec.ts` |

## 5. Required paths and test commands

The contract requires these future files (the listed commands do not imply they currently exist):

```text
server/tests/lab-03/auth.api.test.ts
server/tests/lab-03/authorization.api.test.ts
server/tests/lab-03/staff-queue.api.test.ts
server/tests/lab-03/staff-ticket-detail.api.test.ts
server/tests/lab-03/comments-notes.api.test.ts
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

Final integration records exact output/totals only after execution on `lab3-staging` and then `main`:

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

| Suite | Planned command | Final status |
| --- | --- | --- |
| Server: Lab 1, Lab 2, Lab 3 | `cd server && npm test` | Planned |
| Fresh + upgraded migration/seed | migration fixture command documented by `MIG-01`/`MIG-02` | Planned |
| Client: Lab 1, Lab 2, Lab 3 | `cd client && npm test` | Planned |
| E2E/security/responsive | `npx playwright test` | Planned |
| Screenshot capture | `npx playwright test --project=screenshots` | Planned |

Before marking final, attach passing output/totals from `main`, populate `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/`, and capture Requester Ticket Detail inside `staff-ticket-detail/requester-ticket-detail-{desktop,tablet,mobile}.png`. Record any real failure as a linked Issue rather than weakening an assertion. No visual check is claimed complete by this pre-implementation plan.
