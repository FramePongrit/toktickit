# Lab 3 Issue Plan

This plan decomposes Sprint 3 into one reviewed Pull Request per GitHub Issue. It is based on the Lab 3 handout, the completed Lab 2 increment, and the decisions approved during the specification interview.

## Working Agreement

- Integration branch: `lab3-staging`.
- Every issue begins in **Backlog**, moves to **Specified** after its contract is understood, then moves through **Started**, **PR Review**, **Fixing** when needed, and **Done**.
- Create each feature branch from the latest `lab3-staging` using `feature/<roadmap-number>-<slug>`; the roadmap number is 1-18 below, not the GitHub Issue number.
- Each implementation PR contains its feature tests; tests are not deferred to a later cleanup PR.
- Every PR targets `lab3-staging`, references its issue, records review feedback, and is merged only when its acceptance criteria pass.
- Because staging-branch merges do not automatically close issues, move the card to Done and close the issue manually after the PR merges.
- After all feature issues are Done, use the release issue for the final `lab3-staging` to `main` PR.

## Approved Constraints

- Authentication uses a signed JWT in an HttpOnly cookie backed by a revocable `AuthSession` record checked on every request.
- Sessions have a fixed eight-hour lifetime. Multiple sessions are allowed; normal logout revokes the current session, while password change, administrator reset, and deactivation revoke all sessions.
- Authenticated mutations require a session-bound CSRF token.
- Passwords use bcrypt cost 12. Valid passwords are 10-72 characters with at least one letter and one digit and cannot reuse the current password.
- Emails are trimmed, lowercased, and unique without regard to input casing.
- Administrator has IT Staff Ticket permissions plus User Management, while each User has exactly one Role.
- Requesters never set Ticket status. A Resolution Indication records that the problem appears resolved without changing status.
- Closed and Cancelled are final. A recurrence after Closed requires a new Ticket; only Resolved may transition to Reopened.
- Non-final Tickets require an active Staff/Administrator Owner before a status transition. Claim and Reassign never change status implicitly.
- Public Comments and Internal Notes are append-only plain text of 1-2,000 trimmed characters. Final Tickets reject additions and operational mutations, while permitted historical comments/notes remain readable.
- The Staff Queue defaults to Active Tickets and prioritizes IT Priority descending, then oldest first.
- Lab 3 does not add workflow history, attachment management by Staff, email delivery, account recovery, or other explicitly excluded features.

## GitHub Issue Mapping

| Roadmap | GitHub | Work item |
| ---: | ---: | --- |
| 1 | [#46](https://github.com/FramePongrit/toktickit/issues/46) | Lab 3 engineering contract and domain decisions |
| 2 | [#47](https://github.com/FramePongrit/toktickit/issues/47) | Lab 3 user migration, workflow schema, and seed data |
| 3 | [#48](https://github.com/FramePongrit/toktickit/issues/48) | Authentication security foundation with revocable JWT sessions |
| 4 | [#49](https://github.com/FramePongrit/toktickit/issues/49) | Authentication and password REST APIs |
| 5 | [#50](https://github.com/FramePongrit/toktickit/issues/50) | Login, password change, and role-aware application shell |
| 6 | [#51](https://github.com/FramePongrit/toktickit/issues/51) | Server-side authorization and Requester ownership guards |
| 7 | [#52](https://github.com/FramePongrit/toktickit/issues/52) | Authenticated Requester regression |
| 8 | [#53](https://github.com/FramePongrit/toktickit/issues/53) | Public Comments, Internal Notes, and Resolution Indication APIs |
| 9 | [#54](https://github.com/FramePongrit/toktickit/issues/54) | Requester Ticket Detail communication UI |
| 10 | [#55](https://github.com/FramePongrit/toktickit/issues/55) | Staff Ticket Queue API |
| 11 | [#56](https://github.com/FramePongrit/toktickit/issues/56) | Staff Ticket Queue responsive UI |
| 12 | [#57](https://github.com/FramePongrit/toktickit/issues/57) | Staff Ticket Detail operations API |
| 13 | [#58](https://github.com/FramePongrit/toktickit/issues/58) | Staff Ticket Detail responsive UI |
| 14 | [#59](https://github.com/FramePongrit/toktickit/issues/59) | Administrator User Management API |
| 15 | [#60](https://github.com/FramePongrit/toktickit/issues/60) | Administrator User Management responsive UI |
| 16 | [#61](https://github.com/FramePongrit/toktickit/issues/61) | Lab 3 E2E, security, responsive tests, and screenshots |
| 17 | [#62](https://github.com/FramePongrit/toktickit/issues/62) | Final visual review and evidence documents |
| 18 | [#63](https://github.com/FramePongrit/toktickit/issues/63) | Lab 3 release integration |

---

## Issue 1 - Lab 3 engineering contract and domain decisions

**Goal:** Create the Sprint 3 engineering contract before implementation so every later PR has one approved source of truth.

**Depends on:** Nothing.

### Tasks

- Create `docs/lab-03/specification.md` with sprint goal, interpreted stakeholder request, included/excluded scope, numbered FRs and BRs, data changes, assumptions, ACs, and Product Definition of Done.
- Define the complete Requester/IT Staff/Administrator authorization matrix.
- Record the approved Ticket status matrix, ownership rules, Resolution Indication, priority rules, terminal-state behavior, and confirmation rules.
- Create `docs/lab-03/api-spec.md` with exact endpoints, payloads, statuses, safe errors, JWT/cookie/session behavior, CSRF, and validation.
- Create `docs/lab-03/ui-spec.md` for Login, Change Password, role-aware shell, Requester additions, Staff Queue, Staff Detail, and User Management at all required viewports.
- Create `docs/lab-03/tests.md` before implementation with unit, API, UI, authorization, migration/regression, responsive, and E2E plans.
- Map every AC to at least one planned automated test and exact test-file path.
- Include `CONTEXT.md` and accepted ADRs from the specification interview.

### Acceptance Criteria

- All four required contract documents exist and use consistent names, roles, fields, routes, states, and error codes.
- Requirements are concise, numbered, observable, and not a copy of the handout.
- Every protected operation and required Ticket state appears in a matrix or explicit rule.
- Every AC maps to planned tests, including all test files mandated by the handout.
- Migration, Lab 2 regression, security, responsive behavior, accessibility, evidence, and DoD are explicit.
- This PR is merged before implementation PRs.

### Verification

- Cross-document consistency review.
- FR/BR to AC to Test-ID traceability audit.

**Out of scope:** Production code, migrations, and feature implementation.

**Branch:** `feature/1-lab3-engineering-contract`

---

## Issue 2 - Lab 3 user migration, workflow schema, and seed data

**Goal:** Evolve Lab 2 data safely and provide all entities and realistic local data needed by Lab 3.

**Depends on:** Issue 1.

### Tasks

- Rename/evolve `RequesterUser` into `User` while preserving IDs and every Ticket/Attachment foreign key.
- Remove obsolete `department`; retain one Role per User and add mandatory-password-change state.
- Add `AuthSession` fields for revocation, expiry, and CSRF validation.
- Expand `TicketStatus` to all eight approved values.
- Add nullable Ticket Owner, separate IT Priority initialized from Requested Priority, and Resolution Indication fields.
- Add Public Comment and Internal Note models with one backend-owned author and timestamp per entry.
- Add indexes for session lookup, active-role lookup, Staff Queue queries, ownership, and chronological messages.
- Write a data-preserving Prisma migration without dropping/recreating Ticket or Attachment data.
- Update idempotent seed data: 4 active + 1 inactive Requesters, 3 active + 1 inactive IT Staff, at least 1 active Administrator, realistic Tickets across status/priority/assignment, and safe example comments/notes.
- Give existing Lab 2 Requesters an Initial Password only when their hash is missing; rerunning seed must not reset changed passwords.
- Document local-only credentials without real secrets.

### Acceptance Criteria

- Existing requester ownership, ticket numbers, attachments, uploader/remover identities, and files survive migration.
- Existing Tickets receive IT Priority equal to Requested Priority.
- Fresh and upgraded Lab 2 databases both migrate and seed successfully.
- Repeated seed runs create no duplicates and do not reset established credentials.
- Non-final Ticket Owner data can satisfy the active Staff/Admin invariant; final Tickets retain historical owners.
- Seed data supports every required demonstration.

### Tests

- Add migration/seed regression tests under `server/tests/lab-03/`.
- Run all Lab 1 and Lab 2 server tests against the migrated schema.

**Out of scope:** Auth routes, status service, and feature UI.

**Branch:** `feature/2-lab3-data-migration`

---

## Issue 3 - Authentication security foundation with revocable JWT sessions

**Goal:** Build reusable security modules before exposing authentication routes.

**Depends on:** Issues 1-2.

### Tasks

- Add bcrypt hashing/comparison with cost 12 and the approved password validator.
- Sign JWTs containing identity/session claims only; Role and password-change state remain database-authoritative.
- Configure the HttpOnly, SameSite=Lax cookie and Secure behavior outside local development.
- Implement AuthSession creation, lookup, fixed eight-hour expiry, one-session revocation, and revoke-all behavior.
- Implement session-bound CSRF token generation and verification.
- Restrict credentialed CORS to the configured client origin and JSON requests.
- Implement in-memory login throttling: five failed attempts per normalized email in fifteen minutes, cleared by successful login, with no permanent lockout.
- Validate JWT secret, client origin, and cookie configuration at startup.
- Make clock, randomness, and throttle storage injectable for deterministic tests.

### Acceptance Criteria

- Forged, expired, revoked, missing, or orphaned JWTs cannot authenticate.
- Multiple active sessions per User work as approved.
- Current Role, active state, and password-change state are read from the database on every request.
- CSRF failures stop mutations before domain work runs.
- No plaintext password, password hash, JWT, CSRF secret, or server secret is logged or exposed to the client.

### Tests

- Unit tests for password boundaries/reuse, bcrypt verification, JWT tampering/expiry, revocation, CSRF mismatch, cookie attributes, and throttling windows.

**Out of scope:** Public auth endpoints and React screens.

**Branch:** `feature/3-auth-security-foundation`

---

## Issue 4 - Authentication and password REST APIs

**Goal:** Deliver Login, current User, Logout, mandatory first-login change, and self-service password change.

**Depends on:** Issues 1-3.

### Tasks

- Implement Login using trimmed/lowercase email and bcrypt verification.
- Use one generic 401 response for unknown email and wrong password.
- Return the approved inactive-account response only after valid credentials.
- Create JWT cookie, AuthSession, and CSRF token on successful Login.
- Implement current-user retrieval with safe User fields, Role, and password-change state.
- Implement Logout that revokes only the current session and clears its cookie.
- Implement mandatory initial-password change.
- Implement self-service Change Password with current password and confirmation.
- Revoke every previous session and create a fresh current-device session after password change.
- Gate initial-password Users so only current-user, Change Password, and Logout remain available.
- Apply fixed expiry, throttling, normalized email, CSRF, and safe errors.

### Acceptance Criteria

- Valid active Users authenticate; invalid/inactive cases match the contract.
- Initial-password Users cannot access normal APIs until successful change.
- Logout invalidates the current JWT immediately.
- Password change verifies current password, rejects reuse, revokes old sessions, and retains access on the current device.
- Responses contain no password, hash, token secret, or internal session data.

### Tests

- Implement `server/tests/lab-03/auth.api.test.ts`.
- Cover valid/invalid/inactive/throttled Login, current User, first-login gate, password boundaries/reuse, multiple sessions, expiry, Logout, CSRF, and safe responses.

**Out of scope:** Forgot-password email, MFA, SSO, refresh tokens, remember-me, and administrator reset.

**Branch:** `feature/4-auth-rest-api`

---

## Issue 5 - Login, password change, and role-aware application shell

**Goal:** Replace Development Requester selection with a complete authenticated client shell.

**Depends on:** Issues 1 and 4.

### Tasks

- Add a credentialed client auth layer and attach the active CSRF token to mutations.
- Implement Login validation, busy/duplicate-submit protection, and safe invalid/inactive/rate-limit feedback.
- Implement mandatory and self-service Change Password modes with confirmation and field errors.
- Restore authentication with current-user retrieval on application startup.
- Model loading, unauthenticated, password-change-required, authenticated, forbidden, and safe-failure states.
- Show authenticated full name and Role in the shell.
- Remove selector route, Change Requester action, and requester identity from client storage.
- Add role-aware navigation and route guards.
- Route Requester to My Tickets, IT Staff to Staff Queue, and Administrator to User Management after Login.
- Give Administrator both Tickets and Users navigation.
- Implement Logout and block direct protected-route access afterward.

### Acceptance Criteria

- No Development Requester selector/state remains.
- Refreshing a protected route restores a valid session.
- Initial-password Users cannot bypass Change Password through direct navigation.
- Navigation exposes only permitted destinations; backend errors remain authoritative.
- All states and fields meet Zen Green, accessibility, and responsive conventions.

### Tests

- Implement `client/tests/lab-03/Login.test.tsx`.
- Implement `client/tests/lab-03/ChangePassword.test.tsx`.
- Implement `client/tests/lab-03/AppShell.test.tsx` for landing routes, reload, Role navigation, Logout, CSRF handling, and safe failures.

**Out of scope:** Requester feature migration and Staff/Admin screen content.

**Branch:** `feature/5-authenticated-client-shell`

---

## Issue 6 - Server-side authorization and Requester ownership guards

**Goal:** Centralize authorization so every API is secure independently of hidden frontend controls.

**Depends on:** Issues 1-4.

### Tasks

- Replace `X-Requester-Id` trust with authenticated User resolution.
- Implement reusable authentication, allowed-Role, Requester Ticket/Attachment ownership, and Staff access guards.
- Apply the approved hierarchy: Administrator has Staff Ticket permissions plus User Management.
- Preserve indistinguishable 404 responses for another Requester's protected Ticket/Attachment.
- Use safe 401 for no authentication and safe 403 for known endpoint Role denial.
- Prevent Requesters from receiving Internal Note content.
- Re-check active state, current Role, session, and password-change gate on every request.
- Implement the shared authenticated Ticket-mutation guard order, including the separate unparseable-JSON transport failure and ownership-safe resource lookup.
- Remove client-supplied `requesterId` as an authority everywhere.
- Keep one authorization matrix fixture/table consistent with the engineering contract.

### Acceptance Criteria

- Requester A cannot read or mutate Requester B's resources or enumerate their existence.
- Requester cannot call Staff/Admin APIs; IT Staff cannot call User Management.
- Administrator can perform approved Staff operations.
- Deactivation, demotion, expiry, and revocation take effect immediately.
- Direct API calls cannot bypass UI restrictions or the initial-password gate.

### Tests

- Implement `server/tests/lab-03/authorization.api.test.ts`.
- Cover every Role/operation cell, direct API denial, ownership probing, inactive/demoted Users, revoked sessions, safe bodies, and authentication/Mandatory Password Change/Role/CSRF precedence before resource/domain work.

**Out of scope:** Feature-specific queue, workflow, comments/notes, and Admin CRUD logic.

**Branch:** `feature/6-authorization-guards`

---

## Issue 7 - Authenticated Requester regression

**Goal:** Keep every Lab 2 Requester Ticket and Attachment workflow working after authentication replaces the selector.

**Depends on:** Issues 5-6.

### Tasks

- Derive all Requester Ticket and Attachment ownership from the authenticated User.
- Remove `X-Requester-Id`, requester overrides, selector endpoint use, and stale storage keys.
- Update client requests to use auth cookie and CSRF headers for mutations.
- Preserve Create Ticket, My Tickets, Ticket Detail, upload, download, and soft-removal behavior.
- Preserve ticket-number allocation, query validation, stable pagination, attachment limits/types, removal reason, and ownership-safe 404s.
- Adapt Lab 2 tests to authenticated multi-Requester fixtures without weakening assertions.

### Acceptance Criteria

- An authenticated Requester completes every Lab 2 workflow without a selector.
- Supplying another requester ID cannot alter create/list/detail/attachment ownership.
- All Lab 1/Lab 2 server and client tests remain green after intentional fixture changes.
- No Development Requester endpoint, header, route, action, or client state remains.

### Tests

- Add focused Lab 3 Requester regression tests and update existing Lab 2 setup.
- Run complete server/client regression suites.

**Out of scope:** Comments, Resolution Indication, Staff screens, and Admin screens.

**Branch:** `feature/7-requester-auth-regression`

---

## Issue 8 - Public Comments, Internal Notes, and Resolution Indication APIs

**Goal:** Add secure, append-only Ticket communication and the Requester's non-status resolution signal.

**Depends on:** Issues 2 and 6.

### Tasks

- Implement chronological retrieval and creation of Public Comments.
- Allow the Ticket's Requester and Staff/Admin to read/post Public Comments; protect Requester ownership.
- Implement chronological retrieval and creation of Internal Notes for Staff/Admin only.
- Trim and validate both message types at 1-2,000 characters.
- Treat input as plain text; reject/escape unsafe rendering assumptions and never accept backend-owned author/time fields.
- Prevent edit/delete and prevent new messages on Closed/Cancelled Tickets.
- Keep Public Comments and Internal Notes available for append on `RESOLVED`, which remains Non-final.
- Implement Resolution Indication for the owning Requester on non-final, non-Resolved Tickets.
- Record backend time, reject duplicate active indications, leave `currentStatus` unchanged, and clear the indication when Staff transitions to Reopened.
- Expose the indication to Queue and Detail consumers.
- Apply the shared guard precedence so Final Public Comment/Internal Note requests beat semantic body validation, while Non-final invalid bodies retain validation errors.

### Acceptance Criteria

- Public Comments are visible to all approved participants; Internal Notes never appear to Requesters.
- Another Requester receives the same safe not-found behavior as a missing Ticket.
- Author and creation time always come from authenticated backend state.
- Whitespace, over-limit text, unsafe role access, edits/deletes, duplicate indication, and final-Ticket mutations are rejected safely.
- Resolution Indication never formally Resolves or Closes a Ticket.

### Tests

- Implement `server/tests/lab-03/comments-notes.api.test.ts`.
- Cover visibility, authorization, ownership, ordering, boundaries, append-only behavior, Final-over-invalid-body precedence, terminal states, backend metadata, and Resolution Indication.

**Out of scope:** Staff status transitions and comment/note UI.

**Branch:** `feature/8-ticket-communications-api`

---

## Issue 9 - Requester Ticket Detail communication UI

**Goal:** Extend Requester Ticket Detail with transparent priority, Public Comments, and Resolution Indication while preserving Lab 2 ownership and attachments.

**Depends on:** Issues 5, 7, and 8.

### Tasks

- Show Requested Priority and read-only IT Priority with distinct labels/badges.
- Add chronological Public Comments with author, Role, and backend timestamp.
- Add an accessible plain-text composer with 2,000-character feedback, busy state, validation, retry, and duplicate-submit protection.
- Add the “Problem Appears Resolved” action only in permitted states.
- Keep the Public Comment composer available on `RESOLVED`; only the Resolution Indication action is unavailable there.
- Explain that the action does not change Ticket status and show the recorded indication afterward.
- Hide Internal Notes completely.
- Make Closed/Cancelled detail read-only while retaining history and permitted active attachment downloads.
- Preserve existing upload/remove behavior only for eligible Requester Tickets.

### Acceptance Criteria

- Requester can post/read Public Comments only on owned Tickets.
- Requester never sees Internal Notes or Staff mutation controls.
- IT Priority is visible but not editable.
- Resolution action records the signal, cannot be duplicated, and leaves status unchanged.
- Terminal states disable all new Ticket activity with clear explanation.
- Desktop/tablet/mobile layouts have no clipping or page-level horizontal overflow.

### Tests

- Implement `client/tests/lab-03/RequesterTicketDetail.test.tsx` for authenticated Requester regression, Public Comments, Resolution Indication, and Final read-only history.
- Cover comments on `RESOLVED`, validation, indication states, priorities, terminal read-only behavior, hidden notes, and API failures.

**Out of scope:** Staff Queue and Staff operations.

**Branch:** `feature/9-requester-communications-ui`

---

## Issue 10 - Staff Ticket Queue API

**Goal:** Provide a secure, deterministic, server-side query contract for operational Ticket triage.

**Depends on:** Issues 2 and 6.

### Tasks

- Add Staff/Admin queue retrieval over all Requesters' Tickets.
- Search case-insensitively by Ticket Number, Summary, Requester Name, or Requester Email; trim `q` and limit it to 100 characters.
- Add filters for Status, IT Priority, Category, and Ticket Owner, including My Tickets and Unassigned.
- Add `GET /api/staff/ticket-owners`: a Staff/Admin-only, no-query, deterministic directory of every active `STAFF`/`ADMIN` with exactly `id`, `fullName`, and `role`, independent of visible Ticket ownership.
- Validate numeric Queue Owner filters against that current eligible set with generic field-level validation; do not expose Administrator User Management fields or distinguish absent/ineligible IDs.
- Combine filters with AND semantics.
- Support Active Tickets scope by default and All Tickets explicitly.
- Support sort by IT Priority, Created Date, Last Updated, Ticket Number, and Status.
- Default to IT Priority descending, then oldest Created Date first, with ID as stable final tie-breaker.
- Use one-based pagination with page sizes 10/20/50 and default 10.
- Return safe 400 validation for unsupported query values; never clamp silently.
- Return queue rows containing exactly the data required by the approved seven-column/card UI, including Resolution Indication.

### Acceptance Criteria

- Only Staff/Admin can query the queue.
- Search and every filter work alone and in combination.
- Active default excludes Resolved/Closed/Cancelled; All includes them.
- Pagination remains stable with tied values and reports complete metadata.
- Query response avoids sensitive Internal Notes and unnecessary detail fields.
- Empty/no-results states are distinguishable from errors through response metadata.
- Staff/Admin can obtain safe eligible Owner choices for both the Queue filter and Reassign without Administrator access.

### Tests

- Implement `server/tests/lab-03/staff-queue.api.test.ts`.
- Cover search fields, filters, AND behavior, default scope/order, each sort direction, ties, page boundaries, safe eligible-Owner directory shape/order/Role access, invalid values, assigned/unassigned, and Role denial.

**Out of scope:** Queue React UI and Ticket mutations.

**Branch:** `feature/10-staff-queue-api`

---

## Issue 11 - Staff Ticket Queue responsive UI

**Goal:** Deliver a professional Zen Green queue that helps Staff/Admin find and prioritize active work.

**Depends on:** Issues 5 and 10.

### Tasks

- Build the desktop seven-column representation: Ticket/date, Summary/Requester, Category, Requested + IT Priorities, Status, Owner, and Updated/Open action.
- Build mobile/tablet cards with the same essential information and no horizontal page overflow.
- Add Active/All scope, Search, Status, IT Priority, Category, and Owner filters.
- Load eligible Owner choices from `GET /api/staff/ticket-owners`, with independent loading/retry/forbidden feedback and no inference from Queue rows or Administrator Users.
- Add approved sort choices and 10/20/50 pagination.
- Reset to page 1 after Search/Filter/Sort changes.
- Show Resolution Indication, assigned/unassigned ownership, and text-plus-color badges.
- Implement loading, empty, no-results with Clear Filters, forbidden, retryable failure, and pagination-boundary states.
- Preserve URL/query state where the UI specification requires reproducible navigation.

### Acceptance Criteria

- Every control sends only approved API query parameters.
- Default view is Active Tickets in approved priority/age order.
- Seven-column desktop table remains readable and smaller screens use cards.
- All information and controls are keyboard accessible with visible focus and meaningful labels.
- No page-level horizontal overflow occurs at required viewports.

### Tests

- Implement `client/tests/lab-03/StaffTicketQueue.test.tsx`.
- Cover query wiring, safe eligible-Owner option loading/filtering, reset-to-page-one, rows/cards, badges, indications, all feedback states, and Role denial.

**Out of scope:** Ticket Detail operations.

**Branch:** `feature/11-staff-queue-ui`

---

## Issue 12 - Staff Ticket Detail operations API

**Goal:** Add secure Staff/Admin Ticket Detail and independent owner, IT Priority, and status operations.

**Depends on:** Issues 2, 6, 8, and 10.

### Tasks

- Add Staff/Admin Ticket Detail retrieval with Requester, classification, both priorities, current status, owner, indication, comments/notes, and attachment metadata.
- Allow Staff/Admin to view/download active attachments on any Ticket but not upload/remove them.
- Implement Claim of an unassigned Ticket by the caller; first concurrent claim wins and later claims return 409.
- Implement Reassign only from an already assigned Ticket to an active Staff/Admin; reject Reassign on an Unassigned Ticket with `409 TICKET_UNASSIGNED` and do not support Unassign.
- Keep Claim/Reassign independent from status changes.
- Implement IT Priority update by Staff/Admin only.
- Implement the approved status transition matrix in one domain service.
- Require an active permitted Owner before every transition.
- Require a nonblank valid Public Comment in the same transaction when moving to Waiting for Requester.
- Clear Resolution Indication on transition to Reopened.
- Reject all mutations on Closed/Cancelled Tickets.
- Apply shared precedence: Final precedes Reassign target, IT Priority, status, and Waiting Comment validation; on Non-final Tickets, Claim/Reassign/status state prerequisites precede later payload/target checks.

### Acceptance Criteria

- Direct API calls cannot violate owner, priority, or status rules.
- Concurrent Claim returns one success and one 409 without overwriting ownership.
- Invalid/inactive/Requester reassign targets are rejected.
- Every allowed matrix edge succeeds and every absent edge fails with safe conflict/validation behavior.
- Waiting-for-Requester status and its required Public Comment commit atomically.
- Closed/Cancelled remain final; only Resolved can Reopen.
- Staff attachment access is read/download only.

### Tests

- Implement `server/tests/lab-03/staff-ticket-detail.api.test.ts`.
- Cover detail authorization, Claim race, Reassign including Unassigned `409 TICKET_UNASSIGNED` and malformed/missing/ineligible targets, Final-over-invalid-target/priority/status/comment precedence, inactive Owner, IT Priority, all status edges, missing Owner, Waiting comment transaction, indication clearing, terminal states, and attachment permissions.

**Out of scope:** Staff Detail React UI and workflow history.

**Branch:** `feature/12-staff-ticket-operations-api`

---

## Issue 13 - Staff Ticket Detail responsive UI

**Goal:** Deliver an operational Detail screen with clearly separated actions and safe public/private communication.

**Depends on:** Issues 5, 8, 11, and 12.

### Tasks

- Reuse the Lab 2 Detail structure for read-only Ticket/requester/classification data.
- Add separate Claim/Reassign, Save Priority, and Update Status controls rather than one large form.
- Populate Reassign only from the safe Staff/Admin eligible-Owner directory, with separate directory loading/retry/forbidden feedback and no Administrator Users or visible-owner inference.
- Show only allowed next statuses returned/derived from the approved matrix.
- Add Confirmation Dialogs for transitions to Resolved, Closed, Cancelled, and Reopened.
- Require Public Comment input when selecting Waiting for Requester.
- Add visually distinct Public Comment and Internal Note composers/timelines with plain-text limits.
- Show Resolution Indication prominently to Staff/Admin.
- Show existing attachment metadata and active download actions without Staff upload/remove controls.
- Give every independent action its own busy, success, validation, conflict, forbidden, and safe failure feedback.
- Treat a returned `TICKET_FINAL` as terminal/read-only feedback before local field validation messaging.

### Acceptance Criteria

- Staff/Admin can complete Claim/Reassign, priority, status, Public Comment, and Internal Note workflows.
- Public and Internal composers are visually and semantically difficult to confuse.
- Significant transitions require explicit confirmation and Closed explains finality.
- Stale Claim/Reassign conflicts refresh current ownership safely.
- Final Tickets are read-only.
- Desktop/tablet/mobile layouts remain usable without clipping or horizontal page overflow.

### Tests

- Implement `client/tests/lab-03/StaffTicketDetail.test.tsx`.
- Cover each action independently, eligible-Owner directory states, permitted transitions, dialogs, Waiting comment, conflicts, communications separation, indication, attachments, terminal state, Final-over-local-validation feedback, and failure feedback.

**Out of scope:** Staff attachment upload/removal and workflow history.

**Branch:** `feature/13-staff-ticket-detail-ui`

---

## Issue 14 - Administrator User Management API

**Goal:** Provide the complete minimalist User Management contract with safety rules and immediate authorization effects.

**Depends on:** Issues 2-4 and 6.

### Tasks

- List all active/inactive Users, sorted by full name then ID, with server-side name/email Search and optional single Role filter; no pagination.
- Create one User with name, normalized unique email, one valid Role, active state, and Admin-entered Initial Password + confirmation.
- Edit name, email, Role, and active state.
- Reset another User's Initial Password, set mandatory change, and revoke all their sessions.
- Never return plaintext password or hash.
- Prevent duplicate emails case-insensitively with safe 409 behavior.
- Allow an Administrator to edit their own name/email, while preventing self-deactivation, self-Role change, and Admin reset of their own password.
- Prevent deactivation/demotion of the last active Administrator.
- Prevent deactivation or demotion to Requester when the User owns any non-final Ticket; return 409 with a safe count so Tickets can be reassigned first.
- Permit an Administrator-to-IT-Staff Role change while the User owns Non-final Tickets because the Owner remains eligible.
- Allow Closed/Cancelled Tickets to retain historical ownership.
- Revoke all sessions immediately on deactivation or Role change.

### Acceptance Criteria

- Only Administrator can use these endpoints.
- List/Search/Role filter results and ordering are deterministic.
- Create/edit/reset enforce every validation and safety rule transactionally.
- No operation can leave zero active Administrators or an invalid Owner on a non-final Ticket.
- Role/deactivation/reset changes invalidate affected sessions immediately.
- No user deletion, multiple Roles, or password disclosure exists.

### Tests

- Implement `server/tests/lab-03/users-admin.api.test.ts`.
- Cover list/search/filter/order, create, duplicate casing, edit, own-name/email success, Administrator-to-IT-Staff eligible-owner success, self restrictions, invalid Role, activation, reset/forced change, session revocation, last-admin protection, owned-Ticket conflicts, and non-Admin denial.

**Out of scope:** Deletion, bulk operations, import/export, audit history, invitation email, advanced filters, and account recovery.

**Branch:** `feature/14-admin-users-api`

---

## Issue 15 - Administrator User Management responsive UI

**Goal:** Deliver one intentionally simple User Management screen for every required account operation.

**Depends on:** Issues 5 and 14.

### Tasks

- Build Search, single Role filter, and Create User action above the list.
- Use a desktop table with Name, Email, Role, Status, and Edit; use cards on smaller screens.
- Build an accessible Create dialog with name, email, one Role, active state, Initial Password, and confirmation.
- Build an accessible Edit dialog for name, email, Role, and active state.
- Add Reset Initial Password as a distinct confirmed action in the Edit dialog.
- Disable/explain prohibited self-deactivation, self-Role change, and self-reset actions.
- Present last-admin and owned-non-final-Ticket 409 conflicts with actionable safe messages.
- Refresh the list and show non-color-only success after mutations.
- Cover loading, empty, no-results, validation, forbidden, conflict, and retryable failure states.

### Acceptance Criteria

- Administrator completes list, Search, Role filter, create, edit, activate/deactivate, and reset workflows from one screen.
- Non-Administrators cannot navigate to or use the screen and remain blocked by the API.
- Password fields are never repopulated or exposed after submission.
- Dialog focus, labels, descriptions, validation, cancel, busy, and return-focus behavior are accessible.
- Desktop/tablet/mobile layouts match Zen Green and have no page-level overflow.

### Tests

- Implement `client/tests/lab-03/UserManagement.test.tsx`.
- Cover every required operation/state, self restrictions, conflict messages, sensitive-field handling, Role navigation, and responsive representation classes.

**Out of scope:** User Detail page, pagination, multi-sort/filter, deletion, bulk/import/export, and email delivery.

**Branch:** `feature/15-admin-users-ui`

---

## Issue 16 - Lab 3 E2E, security, responsive tests, and screenshots

**Goal:** Prove the integrated Sprint 3 behavior through real browser/API/database journeys and produce grading evidence.

**Depends on:** Issues 1-15.

### Tasks

- Implement `e2e/lab-03/authentication.spec.ts` for valid/invalid/inactive Login, first password change, Role landing, Logout, and blocked direct access.
- Implement `e2e/lab-03/staff-ticket-flow.spec.ts` for the safe eligible-Owner directory driving Queue filter/Reassign, Queue Search/filters/sort/page, unassigned Claim, Reassign, IT Priority, allowed status changes, Waiting comment, Public Comment, Internal Note, attachments, Requester Resolution Indication, and Final-over-invalid mutation feedback.
- Implement `e2e/lab-03/user-administration.spec.ts` for list/Search/filter, create, duplicate validation, edit, activation, reset/next-login change, self protection, last-admin protection, and forbidden access.
- Add direct API authorization/security checks where browser-only evidence is insufficient.
- Run required major screens at 1440x900, 820x1024, and 390x844.
- Capture deterministic screenshots under the four required Lab 3 artifact folders.
- Verify no clipping, overlap, unreadable grid, inaccessible dialog, or page-level horizontal overflow.
- Run migration/regression from both fresh and upgraded Lab 2 database states.
- Keep test data isolated/idempotent and remove only records/files created by each suite.

### Acceptance Criteria

- All required E2E files exist and pass against real client/server/database processes.
- Every grading demonstration has readable evidence.
- All new and legacy automated tests pass together.
- Screenshots cover authentication, Staff Queue, Staff Detail, and User Management at required viewports.
- Direct authorization evidence proves hidden controls are not the security boundary.

### Tests

- Run complete server, client, Playwright, responsive, and screenshot commands documented in `tests.md`.
- Record failures as new Issues rather than silently weakening assertions.

**Out of scope:** Final narrative evidence and release merge.

**Branch:** `feature/16-lab3-e2e-evidence`

---

## Issue 17 - Final visual review and evidence documents

**Goal:** Turn the completed increment into auditable, concise evidence for Parts 1-9 without changing feature scope.

**Depends on:** Issue 16 and all accepted feature PRs.

### Tasks

- Review every screenshot against Zen Green tokens, badges, editable/read-only styling, validation placement, focus, responsive layout, and accessibility expectations.
- Fix only evidence-blocking defects through linked follow-up issues/PRs; do not hide failures in documentation.
- Complete `docs/lab-03/tests.md` Final statuses with exact passing command output and totals from the integrated branch.
- Complete `docs/lab-03/reviewer.md` with reviewer identity, Issue/PR links, comments, responses, approvals, and Kanban evidence placeholders.
- Complete `docs/lab-03/ai-use.md` with 6-10 selected prompts and the student's own reflection section.
- Update specification/DoD only to reflect approved outcomes, not to rewrite requirements around the implementation.
- Update README with Lab 3 setup, local credentials, migration, test commands, and navigation; confirm `.gitignore` excludes secrets/runtime data.
- Audit all required paths, screenshots, links, and Answer Parts 1-9 evidence.

### Acceptance Criteria

- Required documentation is complete, internally consistent, and links to real Issues/PRs/files.
- Final test evidence comes from the integrated `lab3-staging` state and includes legacy regression.
- Screenshots are readable at normal zoom and all checklist rows are complete.
- No secrets, real passwords, generated dependency folders, runtime uploads, or accidental artifacts are tracked.
- Reviewer and AI-use evidence is truthful and leaves the student's reflection for the student.

### Verification

- Documentation link audit, secret/status audit, final visual checklist, and full test rerun if any code changes were required.

**Out of scope:** New product features and writing the student's personal reflection on their behalf.

**Branch:** `feature/17-lab3-final-evidence`

---

## Issue 18 - Lab 3 release integration

**Goal:** Verify and release the approved Lab 3 increment from `lab3-staging` to `main` with complete workflow evidence.

**Depends on:** Issues 1-17 Done and all feature PRs merged into `lab3-staging`.

### Tasks

- Confirm `lab3-staging` contains every approved feature/evidence PR and no unrelated work.
- Re-run migrations and seed against a clean database and an upgraded Lab 2 database.
- Run complete server, client, E2E, responsive, and screenshot suites from the release candidate.
- Audit tracked files for secrets, plaintext credentials, runtime uploads, build output, and accidental local artifacts.
- Confirm every AC and Product DoD item is satisfied and every Issue/PR/review link is recorded.
- Open the single release PR from `lab3-staging` to `main` and obtain peer review/approval.
- Merge only after required checks pass.
- Verify `main` after merge, update final evidence only through a follow-up issue if anything differs, and move all Lab 3 cards to Done.

### Acceptance Criteria

- Release PR contains only the complete reviewed Lab 3 increment.
- Fresh and upgraded migration paths succeed.
- All legacy and Lab 3 tests pass on the release commit and final `main`.
- No unresolved review thread, failed check, open feature issue, missing artifact, or unchecked DoD item remains.
- Kanban shows all Lab 3 Issues in Done and the repository `main` is the evidence source of truth.

### Verification

- Paste final command output and release PR link into reviewer/test evidence.
- Compare release PR files against the issue list and required repository increment.

**Out of scope:** Additional features or refactors not required to release the approved sprint.

**Branch/PR:** No feature branch required; use the release PR `lab3-staging` -> `main`.
