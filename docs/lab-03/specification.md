# Lab 3 Sprint Engineering Specification

**Project:** TokTickIT - IT Support Ticketing System
**Status:** Approved engineering contract before implementation
**Related documents:** [API contract](./api-spec.md) · [UI specification](./ui-spec.md) · [test plan](./tests.md) · [domain glossary](../../CONTEXT.md) · [ADRs](../adr/)

---

## 1. Sprint goal

Replace Lab 2's development-only requester selection with secure, revocable authenticated sessions and deliver the first operational support workflow: authenticated Requesters retain their own Ticket and Attachment workflows; IT Staff and Administrators can triage and progress Tickets; Administrators manage one-role User accounts. The increment preserves all Lab 2 data and Zen Green conventions while making authorization server-enforced.

## 2. Stakeholder request interpretation

TokTickIT needs real accounts, not a client-selected identity. A Requester remains the only person who can access their own Ticket data, while IT Staff work a shared queue and communicate safely with Requesters. Administrator is an operational role that includes IT Staff Ticket capability and User Management; every User has exactly one Role. A hidden UI action is guidance, never authorization.

## 3. Scope

### Included

- Cookie-based Login, Logout, current User retrieval, forced initial-password change, role-aware shell, and server-side authorization.
- Preserved Requester Ticket creation, list, detail, and Attachment workflows using the authenticated identity, plus Public Comments and Resolution Indication.
- Staff Queue, Staff Ticket Detail, Claim/Reassign, IT Priority, status transitions, Public Comments, and Internal Notes.
- Minimal Administrator User Management: list/search/one Role filter, create, edit name/email/Role/active state, and reset another User's Initial Password.
- Data-preserving Lab 2 migration, idempotent local seed data, automated tests, responsive evidence, and review/evidence documents.

### Excluded

- Self-registration; invitation/reset email; account recovery/unlocking; MFA; social login; SSO; remember-me or refresh tokens.
- Multiple Roles, User deletion, bulk/import/export, account/Role history, departments, organization/profile management, or advanced User-list controls.
- Actions Taken, SLAs/escalations/notifications, dashboards/KPIs, Staff Attachment upload/removal, workflow history, or reopening a Closed/Cancelled Ticket.
- Production deployment/infrastructure changes. Local development credentials are examples only and never secrets.

## 4. Functional requirements

### Authentication and application access

- **FR-01** The system shall authenticate an Active User by normalized email and password, establish an eight-hour revocable session, and return safe current-User data plus the session-bound CSRF token needed to resume a browser session after reload.
- **FR-02** The system shall provide Logout that revokes the current session and clears its authentication cookie.
- **FR-03** The system shall require a User with Mandatory Password Change to save a valid new password before entering normal application routes or APIs.
- **FR-04** The shell shall display the authenticated User's full name and Role, provide Logout and password actions, and expose only navigation permitted for that Role.
- **FR-05** The server shall authorize every protected operation from the current database User and session, never a client-provided `requesterId`, Role, or active flag.

### Requester continuation and communication

- **FR-06** An authenticated Requester shall retain all Lab 2 Ticket and Attachment capabilities only for Tickets they submitted, without Development Requester Selector or Change Requester controls.
- **FR-07** A Requester shall read Public Comment history on a Ticket they submitted and append Public Comments only while it is Non-final.
- **FR-08** A Requester shall record one Resolution Indication on an eligible Non-final, non-Resolved Ticket they submitted without changing Ticket status.

### Staff operations

- **FR-09** IT Staff and Administrators shall retrieve a paginated Staff Queue across Requesters with documented search, filters, ordering, scope, and safe metadata.
- **FR-10** IT Staff and Administrators shall read Staff Ticket Detail, including all permitted operational data and existing Attachment metadata/downloads.
- **FR-11** IT Staff and Administrators shall Claim an Unassigned Ticket or Reassign a Ticket that already has an Owner to an eligible active IT Staff member or Administrator, without an implicit status change. Reassigning an Unassigned Ticket is rejected with `409 TICKET_UNASSIGNED`; Claim is the required operation.
- **FR-12** IT Staff and Administrators shall change IT Priority independently of Requested Priority.
- **FR-13** IT Staff and Administrators shall make only documented status transitions, with an eligible active Owner and required confirmation/comment behavior.
- **FR-14** IT Staff and Administrators shall read Public Comment and Internal Note history, including Final Tickets, and append either only while the Ticket is Non-final; only Staff/Administrators may read or add Internal Notes.

### User administration

- **FR-15** An Administrator shall list Users, search name/email, and optionally filter one Role without receiving passwords, hashes, session secrets, or Internal Notes.
- **FR-16** An Administrator shall create one Active or Inactive User with one valid Role and an Initial Password, and shall edit name/email for any User plus Role/active state for another User subject to safety rules; an Administrator may edit their own name/email but not their own Role or active state.
- **FR-17** An Administrator shall reset another User's Initial Password, force Mandatory Password Change, and immediately revoke that User's sessions.

### Quality and preservation

- **FR-18** The system shall provide loading, busy, success, validation, empty/no-results, forbidden/not-found/conflict, and safe retryable-failure feedback where meaningful.
- **FR-19** All required screens shall reuse Zen Green components, remain keyboard accessible, and work without page-level horizontal overflow at 1440x900, 820x1024, and 390x844.
- **FR-20** Migration and seed operations shall preserve Lab 2 Ticket, Attachment, identity, and ownership data and all legacy automated behavior.

## 5. Authorization matrix

`Yes (own)` means only the Ticket Requester; `Yes` is all records within the stated scope. Administrator inherits IT Staff Ticket permissions by approved product decision.

| Operation | Unauthenticated | Requester | IT Staff | Administrator |
| --- | --- | --- | --- | --- |
| Login | Yes | Yes | Yes | Yes |
| Current User / Logout / change own password | No | Yes | Yes | Yes |
| Create/list/read Ticket and manage Attachment | No | Yes (own) | Read/download only, all Tickets | Read/download only, all Tickets |
| Read Public Comment | No | Yes (own, including Final) | Yes (including Final) | Yes (including Final) |
| Create Public Comment | No | Yes (own, Non-final) | Yes (Non-final) | Yes (Non-final) |
| Set Resolution Indication | No | Yes (own, Non-final and not Resolved) | No | No |
| Read Internal Note | No | No | Yes (including Final) | Yes (including Final) |
| Create Internal Note | No | No | Yes (Non-final) | Yes (Non-final) |
| Staff Queue / Staff Ticket Detail | No | No | Yes | Yes |
| Claim/Reassign / set IT Priority / status transition | No | No | Yes | Yes |
| List/create/edit/reset Users | No | No | No | Yes |

The backend returns `401 UNAUTHENTICATED` before evaluating permissions, `403 FORBIDDEN` for a known User without Role permission, and Requester ownership failures as the matching `404` to avoid confirming another Ticket/Attachment's existence. A Mandatory Password Change User may use only current User, Change Password, and Logout endpoints; all other protected routes return `403 PASSWORD_CHANGE_REQUIRED`.

## 6. Business rules

### Identity, session, and password

- **BR-01** Only an Active User with valid credentials may authenticate. Unknown-email and wrong-password attempts both return the same `401 INVALID_CREDENTIALS`; an inactive account returns `403 USER_INACTIVE` only after password verification.
- **BR-02** Email is trimmed, lowercased, and unique case-insensitively before storage and lookup.
- **BR-03** Passwords are bcrypt hashes at cost 12. Plaintext passwords, hashes, JWTs, server-side CSRF storage/derivation secrets, and server secrets are never returned or logged. The opaque session CSRF token is the sole client-returnable CSRF value: it appears only in the documented Login, current-User, and successful password-change JSON responses and is never logged.
- **BR-04** A valid password is 10-72 trimmed characters, contains at least one letter and one digit, and a changed password cannot match the current password. Confirmation must match.
- **BR-05** Five failed Login attempts for one normalized email in 15 minutes return `429 LOGIN_THROTTLED`; successful Login clears that email's counter. This is in-memory local-lab throttling, not a permanent lockout.
- **BR-06** Login creates an `AuthSession` and signed JWT containing only User/session identifiers and expiry. Role, active state, and mandatory-change state are database-authoritative on every protected request.
- **BR-07** A session and JWT expire after a fixed eight hours. Multiple concurrent sessions are allowed; no sliding expiry, refresh, or remember-me option exists.
- **BR-08** Logout revokes only the current session. Password change creates a fresh current-device session and revokes every prior session; Administrator reset and User deactivation revoke every session for the affected User.
- **BR-09** The authentication cookie is HttpOnly, `SameSite=Lax`, `Path=/`, and `Secure` outside local development. Login, successful `GET /api/auth/me`, and successful password change each return the same session's opaque CSRF token in a `Cache-Control: no-store` JSON response; the client holds it only in memory. Authenticated mutations require it in `X-CSRF-Token`; credentialed CORS accepts only the configured client origin.
- **BR-10** A User in Mandatory Password Change may not enter normal screens or APIs until a successful password change. The server, not route hiding, enforces this.

### Roles and User safety

- **BR-11** Each User has exactly one Role: `REQUESTER`, `STAFF`, or `ADMIN`; Administrator includes IT Staff Ticket permission in this product.
- **BR-12** Deactivation retains historical identity but stops authentication and new actions. Deactivation, or a Role change to `REQUESTER`, is rejected if the User owns any Non-final Ticket, reporting only the documented safe conflict metadata `error.meta.nonFinalOwnedTicketCount` so Tickets can be reassigned first. A change from `ADMIN` to `STAFF` is permitted because both Roles are eligible Ticket Owners.
- **BR-13** An Administrator may edit their own name/email but cannot deactivate themself, change their own Role, or reset their own Initial Password via administration. Self-service Change Password remains available.
- **BR-14** The Last Active Administrator cannot be deactivated or demoted. User deletion is never provided.
- **BR-15** Create and reset use an Administrator-entered Initial Password and confirmation; reset always sets Mandatory Password Change. Password fields are write-only.

### Ticket ownership, priorities, and workflow

- **BR-16** The authenticated Requester identity fixes Ticket submission ownership; client `requesterId` values are ignored/rejected and never widen access.
- **BR-17** A Ticket begins `NEW`, may be Unassigned, and has Requested Priority immutable from creation. IT Priority is initialized to Requested Priority and only Staff/Administrators may change it.
- **BR-18** A Ticket Owner is one active User with Role `STAFF` or `ADMIN`. Claim atomically assigns only an Unassigned Ticket to the caller; Reassign selects another active eligible User only when the Ticket already has an Owner. Reassigning an Unassigned Ticket returns `409 TICKET_UNASSIGNED` and neither action changes status.
- **BR-19** Every status transition requires a current active eligible Ticket Owner. A Claim/Reassign race never overwrites an existing Owner: the loser receives `409 TICKET_ALREADY_ASSIGNED` with only the documented safe `error.meta.owner` representation.
- **BR-20** `CLOSED` and `CANCELLED` are Final and completely read-only for mutations, while permitted historical content remains readable under BR-23/BR-24. `RESOLVED` is Non-final. A later problem after Closed is a new Ticket (Recurrence), not a reopen.
- **BR-21** Transitioning to `WAITING_FOR_REQUESTER` requires a trimmed 1-2,000 character Public Comment in the same database transaction. A Requester reply does not implicitly change status.
- **BR-22** Transitioning to `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED` requires explicit UI confirmation. On `REOPENED`, clear the Resolution Indication. Only `RESOLVED` can transition to `REOPENED`.

| From | Permitted next status | Confirmation | Additional rule |
| --- | --- | --- | --- |
| `NEW` | `OPEN`, `CANCELLED` | Cancel only | active eligible Owner |
| `OPEN` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `CANCELLED` | Cancel only | Waiting needs Public Comment |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` | Resolved/Cancel | Waiting needs Public Comment |
| `WAITING_FOR_REQUESTER` | `OPEN`, `IN_PROGRESS`, `CANCELLED` | Cancel only | active eligible Owner |
| `RESOLVED` | `CLOSED`, `REOPENED` | both | Reopened clears Indication |
| `REOPENED` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` | Resolved/Cancel | Waiting needs Public Comment |
| `CLOSED`, `CANCELLED` | none | n/a | Final; return `409 TICKET_FINAL` |

### Communication and safe behavior

- **BR-23** Public Comment history is visible to the Ticket Requester, IT Staff, and Administrators, and Internal Note history only to IT Staff and Administrators, including after finality. Both are append-only backend-authored records with author/time and trimmed plain text of 1-2,000 characters; no new entry may be appended after finality.
- **BR-24** Historical Public Comment and permitted Internal Note reads remain available after finality. Creating/appending either, Resolution Indication, ownership, priority, and status changes are rejected on Final Tickets. Resolution Indication is available only on a Non-final Ticket that is not `RESOLVED`, is at most one current indication, and repeated indication returns `409 RESOLUTION_ALREADY_INDICATED`.
- **BR-25** All user-entered communication is rendered as plain text, never interpreted HTML. Safe errors expose no stack, SQL, filesystem path, hash, token, or hidden-resource existence.
- **BR-26** Lab 2 Requester ownership behavior remains: a non-owned Ticket/Attachment returns `404 TICKET_NOT_FOUND`/`ATTACHMENT_NOT_FOUND`, while Staff/Admin can read/download all existing Ticket Attachments but cannot upload/remove them.
- **BR-27** Queue filters combine with AND semantics; invalid input is a field-level 400 and is never silently clamped. Default Active scope includes `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, and `REOPENED`, excluding `RESOLVED`, `CLOSED`, and `CANCELLED`.
- **BR-28** Directly invoking an unauthorized endpoint must fail even if a UI control is hidden or disabled.
- **BR-29** Lab 2 ticket-number allocation, category/related-system validation, attachment size/type/count/soft-removal, and safe responses remain unchanged unless this contract expressly supersedes their identity middleware.

## 7. UI Specification Summary

The complete visual contract is in [ui-spec.md](./ui-spec.md). Login and Change Password are focused accessible cards with field-level validation, busy, safe invalid/inactive/throttled/failure, and forced-change states. The authenticated shell loads `GET /api/auth/me` before revealing identity/navigation, retains the returned in-memory CSRF token, shows only Role-permitted navigation, and has Logout.

Authenticated Requesters keep Lab 2 Create, My Tickets, Ticket Detail, and Attachment behavior without a selector, and gain clearly public comments plus a non-status-changing Resolution Indication. Staff/Admin receive a URL-reproducible Queue and Staff Detail whose independent owner, priority, status, public-comment, and restricted-note actions have independent feedback. Administrator receives one responsive User Management list with accessible Create/Edit/Reset dialogs. Every screen uses Zen Green, visible focus, text-plus-colour badges, labelled controls, live feedback, and desktop/tablet/mobile layouts at 1440x900, 820x1024, and 390x844 without page-level horizontal overflow. Final Ticket histories stay readable but all mutation controls are unavailable.

## 8. API Contract Summary

The exact route, JSON, cookie, CSRF, validation, status, safe-error, and conflict-metadata contract is in [api-spec.md](./api-spec.md). Login establishes an eight-hour revocable JWT/`AuthSession` cookie; Login, `GET /api/auth/me`, and successful password change return the session CSRF token with `Cache-Control: no-store` so a cookie-restored shell can safely resume mutations. Current database state, not JWT claims or client identity fields, determines active status, Role, mandatory change, and ownership.

Routes cover authentication/current User/password/Logout; authenticated Lab 2 Requester routes; Public Comments/Resolution Indication; Staff Queue/Detail/Claim/Reassign/IT Priority/status/Internal Notes; and Admin Users. The common response envelope separates field validation (`error.details`) from documented `409` conflict metadata (`error.meta`). Requester non-ownership remains indistinguishable from absence; historical comments/notes can be read after finality but no Ticket mutation can be made.

## 9. Data changes, migration, and seed decisions

| Concept | Lab 3 contract |
| --- | --- |
| `RequesterUser` | Evolve/rename in place to `User`, retaining primary keys; remove obsolete `department`; retain Ticket/Attachment foreign-key meaning. |
| `User` | `fullName`, normalized unique `email`, `passwordHash`, one `role`, `active`, `mustChangePassword`, timestamps. |
| `AuthSession` | opaque session id/JWT binding, User FK, CSRF token/secret representation, issued/expiry/revoked timestamps; indexed by session lookup, User, and expiry. |
| `Ticket` | expand status enum; nullable `ownerId`; `itPriority`; nullable current Resolution Indication value/time; retain Requester, Ticket Number, classification, Attachments. |
| Comments/notes | Separate append-only `PublicComment` and `InternalNote`, each with Ticket FK, backend author FK, text, `createdAt`; indexes by Ticket/created time and author. |

Migration is additive/evolutionary and preserves every Ticket ID/number, Attachment row/file, Requester identity, uploader/remover relationship, and Ticket ownership. Existing Tickets receive `itPriority = requestedPriority`; existing Requesters receive an Initial Password only if no hash exists. No migration drops/recreates Tickets or Attachments. Seed is idempotent: four active plus one inactive Requester, three active plus one inactive IT Staff, at least one active Administrator, and realistic assigned/unassigned Tickets across statuses/priorities with safe example communications. Re-running seed neither duplicates rows nor resets changed passwords. Required indexes cover active Role lookup, session lookup, queue scope/sort/owner, and chronological messages.

## 10. Acceptance criteria

- **AC-01** Active valid credentials create authenticated access with safe identity/Role data; invalid and inactive cases follow the API contract.
- **AC-02** Mandatory Password Change blocks normal screens and APIs until a valid new password succeeds; Logout then blocks direct access.
- **AC-03** Protected operations enforce current session, active state, Role, CSRF, and Requester ownership server-side.
- **AC-04** Lab 2 requester Ticket/Attachment behavior works through authenticated identity with no selector/change-requester state.
- **AC-05** Public Comments may be appended on every permitted Non-final Ticket, including `RESOLVED`; Resolution Indication obeys its separate non-Resolved/no-status-change rule; Final Tickets reject appends; Internal Notes never reach a Requester.
- **AC-06** Staff/Admin Queue supports documented search, AND filters, scope, stable sort, page sizes, pagination metadata, and safe failures.
- **AC-07** Staff/Admin Ticket Detail supports authorized read/download, atomic Claim/Reassign, IT Priority, and every permitted status edge while rejecting absent edges/final mutations.
- **AC-08** Waiting for Requester requires an atomic Public Comment; Resolution Indication clears on Reopened; Closed/Cancelled remain Final.
- **AC-09** Administrator User Management supports list/search/filter/create/edit/reset while enforcing one Role, normalized unique email, write-only passwords, session revocation, self safety, last-admin safety, and non-final ownership safety.
- **AC-10** All major screens use Zen Green, accessible states, role-aware navigation, distinguish public/private content, and have no page-level horizontal overflow at required viewports.
- **AC-11** Fresh and upgraded Lab 2 databases migrate/seed safely, preserve historical data, and pass Lab 1/Lab 2 regression.
- **AC-12** Required server, client, E2E, responsive, screenshot, review, AI-use, and traceability artifacts exist and are verified on the integrated branch.

## 11. Product Definition of Done

- [ ] All FRs, BRs, API/UI contracts, ADRs, and glossary terms are implemented consistently; every AC has passing planned tests documented in `tests.md`.
- [ ] Every protected route has authentication, Mandatory Password Change, Role, ownership, CSRF, input, safe-error, and Final-state enforcement as applicable.
- [ ] Fresh and upgraded database migration/seed preserve Lab 2 records and are idempotent; legacy and Lab 3 server/client suites pass.
- [ ] Required API, component, E2E, authorization/security, responsive, and screenshot tests pass from `main`; evidence paths are populated and readable.
- [ ] Desktop/tablet/mobile visual checklist passes for Login, password change/shell, Requester Ticket Detail, Staff Queue, Staff Detail, and User Management; keyboard/focus/dialog/feedback behavior is verified.
- [ ] Peer review, Issue/PR/Kanban evidence, reviewer record, selected AI-use prompts/reflection, README setup, and `.gitignore` safety audit are complete; no secrets/runtime uploads/build outputs are tracked.
- [ ] No excluded capability was introduced, no open review thread/check remains, and the final `main` branch is the evidence source of truth.

## 12. Assumptions and decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D-01 | Administrator inherits IT Staff Ticket permissions. | The approved issue plan makes Administrator an operational superset while preserving a separate User Management responsibility. |
| D-02 | Session JWT is cookie-held but checked against `AuthSession` every request. | Combines standard HttpOnly cookie handling with immediate revocation/current-User authorization; see ADR 0001. |
| D-03 | `RESOLVED` is reviewable; only `CLOSED`/`CANCELLED` are Final. | Prevents a closure/reopen loop and represents later problems as a new Recurrence; see ADR 0002. |
| D-04 | Existing Requesters evolve in place. | Preserves all foreign keys and historical ownership with the smallest migration risk; see ADR 0003. |
| D-05 | Queue default is Active scope, IT Priority descending then oldest creation time then ID. | Presents urgent work first while producing deterministic pagination. |
