# Lab 3 API Contract

**Base URL (development):** `http://localhost:3000`
**Content type:** `application/json` unless stated otherwise
**Related documents:** [specification](./specification.md) · [test plan](./tests.md)

---

## 1. Common contract

All non-2xx JSON responses use exactly:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Submitted data is invalid.",
    "details": [{ "field": "email", "message": "Enter a valid email address." }]
  }
}
```

`details` is supplied only for validation errors. A documented `409` may instead include an `error.meta` object with only its named, safe fields; it is absent from every other response. Messages are display-safe and never contain secrets, hashes, JWTs, CSRF values, stack traces, SQL, paths, or undisclosed resource identifiers. Timestamps are ISO 8601 UTC strings. All IDs are positive integers.

The only conflict metadata shapes are:

```json
{ "error": { "code": "TICKET_ALREADY_ASSIGNED", "message": "This Ticket already has an owner.", "meta": { "owner": { "id": 7, "fullName": "Niran Staff", "role": "STAFF" } } } }
```

```json
{ "error": { "code": "USER_OWNS_NON_FINAL_TICKETS", "message": "Reassign this User's non-final Tickets before changing this account.", "meta": { "nonFinalOwnedTicketCount": 2 } } }
```

`error.meta.owner` has exactly `id`, `fullName`, and `role`; `error.meta.nonFinalOwnedTicketCount` is a non-negative integer. A client must not infer or require additional metadata from any conflict.

### 1.1 Authentication, cookies, and CSRF

- `POST /api/auth/login` issues a signed JWT in the HttpOnly `toktickit_session` cookie and returns that session's opaque CSRF token in its JSON body. `GET /api/auth/me` returns the same token for a valid cookie-restored session, so the shell can bootstrap after reload. A successful password change creates a new session and returns its new token; Logout returns no token because it revokes the session. The JWT carries only `sub` (User id), `sid` (AuthSession id), `iat`, and fixed `exp`.
- Cookie attributes: `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`; append `Secure` outside local development. Cookies are never read by JavaScript.
- Each `AuthSession` owns one cryptographically random CSRF token for its fixed lifetime. The client keeps it only in memory and sends it as `X-CSRF-Token` on **every authenticated state-changing request** (POST/PATCH/PUT/DELETE), including Logout and password change. It is not a cookie, is never put in a URL, does not rotate on ordinary mutations, and is invalidated with the session.
- Login, `GET /api/auth/me`, and successful password change responses containing `csrfToken` send `Cache-Control: no-store`; the browser client calls `GET /api/auth/me` with credentials during shell bootstrap before enabling mutation controls.
- Each protected request verifies signature, expiry, `AuthSession` existence/revocation/expiry, current User `active`, and current User state/Role from the database. A CSRF check runs before domain work.
- Credentialed CORS is restricted to configured `CLIENT_ORIGIN`; the browser client uses credentials. `JWT_SECRET`, client origin, and cookie configuration must be validated at startup.

### 1.2 Protected-route failures

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | Missing, invalid, expired, revoked, or orphaned session/JWT. |
| 403 | `USER_INACTIVE` | The authenticated User has become inactive. |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Mandatory-change User attempted any route except current User, password change, or Logout. |
| 403 | `FORBIDDEN` | Active authenticated User lacks the required Role. |
| 403 | `CSRF_INVALID` | Missing, invalid, or wrong-session CSRF token on a mutation. |
| 404 | `TICKET_NOT_FOUND` / `ATTACHMENT_NOT_FOUND` | Missing resource or, for Requesters, a resource they do not own. |
| 409 | contract-specific code | A valid request conflicts with current state. |
| 500 | `INTERNAL_ERROR` | Unexpected failure only. |

Requester ownership uses 404 rather than 403, so a Requester cannot enumerate another Requester's Ticket or Attachment. Staff/Admin access to a nonexistent Ticket is ordinary 404. No endpoint accepts a client `requesterId` to determine ownership.

### 1.3 Safe User and Ticket representations

`SafeUser`:

```json
{
  "id": 7,
  "fullName": "Niran Staff",
  "email": "niran@example.test",
  "role": "STAFF",
  "active": true,
  "mustChangePassword": false
}
```

Ticket status values are `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, and `CANCELLED`; priority values are `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Public text is returned and rendered as plain text, not HTML.

## 2. Authentication and password routes

### `POST /api/auth/login`

Request:

```json
{ "email": "niran@example.test", "password": "valid-password1" }
```

`email` is trimmed/lowercased and must be a syntactically valid email; `password` is required but not echoed in validation details. Five failed credential attempts per normalized email in 15 minutes produce `429 LOGIN_THROTTLED`; success clears the counter. Unknown email and wrong password both return `401 INVALID_CREDENTIALS`. A correct password on an inactive User returns `403 USER_INACTIVE` without setting a cookie.

**200:** sets the authentication cookie and returns:

```json
{
  "user": { "id": 7, "fullName": "Niran Staff", "email": "niran@example.test", "role": "STAFF", "active": true, "mustChangePassword": false },
  "csrfToken": "opaque-session-bound-value"
}
```

`400 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS`, `403 USER_INACTIVE`, `429 LOGIN_THROTTLED`, and `500 INTERNAL_ERROR` are possible.

### `GET /api/auth/me`

Requires a valid session; permitted during Mandatory Password Change.

**200:** `{ "user": SafeUser, "csrfToken": "opaque-session-bound-value" }`, with `Cache-Control: no-store`. Uses database-current `role`, `active`, and `mustChangePassword`, never JWT claims. This is the only reload/bootstrap CSRF recovery mechanism; it remains permitted during Mandatory Password Change.

### `POST /api/auth/logout`

Requires a valid session and CSRF token; permitted during Mandatory Password Change. Body is empty. **204:** revoke the current `AuthSession` and clear `toktickit_session` using matching cookie attributes. It is intentionally not a revoke-all operation.

### `POST /api/auth/change-password`

Requires valid session and CSRF. Request:

```json
{
  "currentPassword": "valid-password1",
  "newPassword": "different-password2",
  "confirmation": "different-password2"
}
```

All password values are 10-72 trimmed characters and require at least one letter and digit. `newPassword` must differ from current; confirmation must match. Server verifies `currentPassword` even for Mandatory Password Change. **200:** revoke all sessions for the User, create one new current-device AuthSession, replace the cookie, and return `{ "user": SafeUser, "csrfToken": "..." }` with `mustChangePassword: false`.

Failures: `400 VALIDATION_FAILED`, `401 CURRENT_PASSWORD_INVALID`, the protected-route failures, and `500`. No password value/hash is returned.

## 3. Preserved Requester routes

The existing Lab 2 routes remain at their paths and retain their body/response/validation contracts. Remove `X-Requester-Id` from every client/server route; all now require session authentication. `GET /api/categories` and `GET /api/related-systems` remain public bare-array reference-data endpoints. `GET /api/dev-requesters` is removed (`404 ROUTE_NOT_FOUND`).

| Route | Requester behavior | Staff/Admin behavior |
| --- | --- | --- |
| `POST /api/tickets` | Create with caller as Ticket Requester; preserves Lab 2 validation and ticket-number allocation. | `403 FORBIDDEN` |
| `GET /api/tickets` | Caller-owned Lab 2 paginated list and query contract. | `403 FORBIDDEN` |
| `GET /api/tickets/:id` | Caller-owned detail, now including permitted Lab 3 public fields. | `403 FORBIDDEN`; use Staff detail route. |
| `POST /api/tickets/:id/attachments` | Own Non-final Ticket only; Lab 2 multipart/limit/type rules. | `403 FORBIDDEN` |
| `GET /api/attachments/:id`, `/download` | Own Attachment; preserved `410 ATTACHMENT_REMOVED`. | Staff/Admin only may download through the same route for any Ticket. |
| `PATCH /api/attachments/:id/remove` | Own Non-final Ticket only; preserved soft-removal contract. | `403 FORBIDDEN` |

`POST /api/tickets`, attachment upload, and soft removal require CSRF. Creation rejects a Mandatory Password Change User or a non-Requester. Existing Lab 2 response fields remain, except `requester.department` is removed and Ticket read representations may add `itPriority`, `owner`, `resolutionIndication`, and `publicComments` as defined below. Requester Ticket Detail never includes Internal Notes.

### Requester communication routes

#### `GET /api/tickets/:id/comments`

Requires authenticated Requester ownership or Staff/Admin access. **200:** `{ "data": [PublicComment] }`, oldest first, for any Ticket including a Final Ticket. `PublicComment` contains `id`, `body`, `createdAt`, and safe `author` (`id`, `fullName`, `role`), but no email/hash/session data.

#### `POST /api/tickets/:id/comments`

Requires CSRF and access to the Ticket. Request `{ "body": "Please restart and tell us whether it changes." }`. `body` is trimmed, plain text, 1-2,000 characters. Requester may post only to own Non-final Ticket; Staff/Admin may post on any Non-final Ticket. **201:** created `PublicComment`. `400 VALIDATION_FAILED`; `409 TICKET_FINAL`; standard ownership/Role errors.

#### `PUT /api/tickets/:id/resolution-indication`

Requires Requester ownership and CSRF. Body may be empty. A Non-final Ticket other than `RESOLVED`, with no current indication, receives a server timestamp and indicator author. **200:** `{ "resolutionIndication": { "indicatedAt": "...", "indicatedBy": SafeUser } }`; it does not alter `currentStatus`. A second current indication is `409 RESOLUTION_ALREADY_INDICATED`; a `RESOLVED` Ticket is `409 RESOLUTION_INDICATION_NOT_ALLOWED`; a Final Ticket is `409 TICKET_FINAL`. It is cleared only on the Staff/Admin `RESOLVED -> REOPENED` transition.

## 4. Staff Queue and Staff Ticket Detail

All routes in this section require `STAFF` or `ADMIN`; all mutations require CSRF.

### `GET /api/staff/tickets`

Query parameters:

| Parameter | Allowed/default |
| --- | --- |
| `scope` | `active` (default) or `all`; active is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`. |
| `q` | trimmed case-insensitive substring, 1-100 chars; Ticket Number, Summary, Requester name, or Requester email. |
| `status` | one Ticket status. |
| `itPriority` | one Priority value. |
| `categoryId` | positive integer. |
| `owner` | positive eligible User id, `me`, or `unassigned`. |
| `sort` | `itPriority`, `createdAt`, `updatedAt`, `ticketNumber`, or `status`; default `itPriority`. |
| `order` | `asc` or `desc`; omitted is `desc` for default/explicit `itPriority`, otherwise `asc`. |
| `page` / `pageSize` | 1-based / `10`, `20`, or `50`; defaults `1` / `10`. |

All supplied filters combine with AND. Priority severity is `LOW < MEDIUM < HIGH < URGENT`; Status rank is `NEW < OPEN < IN_PROGRESS < WAITING_FOR_REQUESTER < REOPENED < RESOLVED < CLOSED < CANCELLED`. The exact ordering is:

| `sort` | Primary key in requested `order` | Fixed secondary and final keys |
| --- | --- | --- |
| omitted / `itPriority` | priority severity; default `desc` | `createdAt ASC`, then `id ASC` |
| `createdAt` | `createdAt` | `id ASC` |
| `updatedAt` | `updatedAt` | `id ASC` |
| `ticketNumber` | `ticketNumber` | `id ASC` |
| `status` | documented status rank | `createdAt ASC`, then `id ASC` |

For an explicitly selected non-priority `sort`, omitted `order` defaults to `asc`; an explicit `asc`/`desc` changes only the primary key. Thus every direction and page has a stable final `id ASC` tie-breaker. Invalid/unknown values are `400 VALIDATION_FAILED` with `details`; values are never clamped.

**200:**

```json
{
  "data": [{
    "id": 42, "ticketNumber": "TKT-2026-000042", "summary": "Laptop battery drains quickly",
    "requestedPriority": "MEDIUM", "itPriority": "HIGH", "currentStatus": "IN_PROGRESS",
    "createdAt": "2026-09-04T09:14:00.000Z", "updatedAt": "2026-09-04T10:00:00.000Z",
    "category": { "id": 2, "name": "Hardware" },
    "requester": { "id": 4, "fullName": "Aom Requester", "email": "aom@example.test" },
    "owner": { "id": 7, "fullName": "Niran Staff", "role": "STAFF" },
    "resolutionIndication": null
  }],
  "page": 1, "pageSize": 10, "total": 1, "totalPages": 1
}
```

An empty result is a 200 with `data: []`, `total: 0`, `totalPages: 0`; the client distinguishes empty/no-results from its active query state. No Internal Note text or unnecessary Ticket description/attachments appears in Queue rows.

### `GET /api/staff/tickets/:id`

**200:** Staff Ticket Detail includes Ticket core/classification, Ticket Requester (`id`, name, email), Requested/IT Priority, status, owner, indication, Attachment metadata, Public Comments, and Internal Notes (each with safe author/time), plus `allowedTransitions` derived from the current status and whether an eligible Owner exists. Attachment bytes are only through `/api/attachments/:id/download`; `POST`/remove remain denied to Staff/Admin. `404 TICKET_NOT_FOUND` for no record.

### `PATCH /api/staff/tickets/:id/claim`

No body. Atomically succeeds only if Ticket has no Owner; caller becomes Owner. **200:** `{ "owner": { "id", "fullName", "role" } }`. Existing Owner returns `409 TICKET_ALREADY_ASSIGNED` with the exact `error.meta.owner` representation defined in §1; Final Ticket returns `409 TICKET_FINAL`. A database conditional update/transaction is required so two concurrent claims produce exactly one 200.

### `PATCH /api/staff/tickets/:id/owner`

Request `{ "ownerId": 8 }`. Target must be a current Active `STAFF` or `ADMIN`; unassigning is not an operation. **200:** safe owner representation. `400 VALIDATION_FAILED` for malformed id, `404 USER_NOT_FOUND` for absent target, `409 OWNER_NOT_ELIGIBLE` for inactive/wrong-Role target, `409 TICKET_FINAL` for a Final Ticket.

### `PATCH /api/staff/tickets/:id/it-priority`

Request `{ "itPriority": "HIGH" }`. **200:** `{ "itPriority": "HIGH" }`. Only Staff/Admin may change it; Requested Priority never changes. Invalid enum is `400 VALIDATION_FAILED`; Final is `409 TICKET_FINAL`.

### `PATCH /api/staff/tickets/:id/status`

Request:

```json
{ "status": "WAITING_FOR_REQUESTER", "publicComment": "Please provide the laptop asset tag." }
```

`status` must be one allowed edge in specification §6. An active eligible current Owner is required for every transition (`409 TICKET_OWNER_REQUIRED` if missing/ineligible). `publicComment` is required only for `WAITING_FOR_REQUESTER`, with the same 1-2,000 plain-text validation, and the status transition plus comment insertion occur in one transaction. Extra `publicComment` on another transition is rejected (`400 VALIDATION_FAILED`) to keep the operation unambiguous; callers use the comments endpoint. **200:** updated `{ "currentStatus", "resolutionIndication", "allowedTransitions" }`. Invalid edge is `409 INVALID_STATUS_TRANSITION`; Final is `409 TICKET_FINAL`. The UI asks confirmation for `RESOLVED`, `CLOSED`, `CANCELLED`, and `REOPENED`, but the API performs no client-trust confirmation flag.

### Internal Note routes

`GET /api/staff/tickets/:id/notes` returns `{ "data": [InternalNote] }`, oldest first, for any Ticket including a Final Ticket. `POST /api/staff/tickets/:id/notes` accepts `{ "body": "Checked endpoint logs; awaiting requester." }`, validates 1-2,000 trimmed plain-text characters, and returns **201** `InternalNote` only for a Non-final Ticket; a Final Ticket returns `409 TICKET_FINAL`. Only Staff/Admin use either route. Requesters never receive note content (`403 FORBIDDEN` before a representation is assembled).

## 5. Administrator User Management

Every route below requires `ADMIN` and CSRF on mutations. These endpoints expose only `SafeUser` fields; passwords, password hashes, session records/tokens, and Internal Notes never appear.

### `GET /api/admin/users`

`q` is optional trimmed case-insensitive 1-100 character substring over full name or normalized email; `role` optionally equals one valid Role. They combine with AND. No pagination. **200:** `{ "data": [SafeUser] }`, sorted `fullName` ascending then `id` ascending. Unknown query values are `400 VALIDATION_FAILED`.

### `POST /api/admin/users`

```json
{
  "fullName": "Mali Requester",
  "email": "mali@example.test",
  "role": "REQUESTER",
  "active": true,
  "initialPassword": "initial-password1",
  "confirmation": "initial-password1"
}
```

`fullName` is trimmed 1-120 characters; email follows normalization; role is exactly one permitted enum; active is boolean; password/confirmation meet §2 rules. **201:** `{ "user": SafeUser }` with `mustChangePassword: true`. Duplicate normalized email is `409 EMAIL_ALREADY_EXISTS`; invalid values are `400 VALIDATION_FAILED`.

### `PATCH /api/admin/users/:id`

Request supplies any edit fields `{ "fullName"?, "email"?, "role"?, "active"? }`; at least one field is required and supplied fields are fully validated. **200:** `{ "user": SafeUser }`. A Role change or deactivation revokes all target sessions immediately. The current administrator cannot change their own Role or active state (`409 ADMIN_SELF_PROTECTION`). Deactivation/demotion of the Last Active Administrator is `409 LAST_ACTIVE_ADMINISTRATOR`. Deactivation or demotion to `REQUESTER` of a User who owns Non-final Tickets is `409 USER_OWNS_NON_FINAL_TICKETS` with the exact `error.meta.nonFinalOwnedTicketCount` representation defined in §1; Final historical ownership does not block it. Duplicate normalized email is `409 EMAIL_ALREADY_EXISTS`.

### `POST /api/admin/users/:id/reset-password`

Request `{ "initialPassword": "replacement-password2", "confirmation": "replacement-password2" }`. Validates the same password contract, writes the bcrypt hash, sets `mustChangePassword: true`, and revokes every target session atomically. **200:** `{ "user": SafeUser }`. Resetting oneself is `409 ADMIN_SELF_PROTECTION`; nonexistent target is `404 USER_NOT_FOUND`.

## 6. Status-code and error-code index

| Code | Status |
| --- | ---: |
| `VALIDATION_FAILED` | 400 |
| `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `CURRENT_PASSWORD_INVALID` | 401 |
| `USER_INACTIVE`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `CSRF_INVALID` | 403 |
| `TICKET_NOT_FOUND`, `ATTACHMENT_NOT_FOUND`, `USER_NOT_FOUND`, `ROUTE_NOT_FOUND` | 404 |
| `TICKET_FINAL`, `TICKET_ALREADY_ASSIGNED`, `OWNER_NOT_ELIGIBLE`, `TICKET_OWNER_REQUIRED`, `INVALID_STATUS_TRANSITION`, `RESOLUTION_ALREADY_INDICATED`, `RESOLUTION_INDICATION_NOT_ALLOWED`, `EMAIL_ALREADY_EXISTS`, `ADMIN_SELF_PROTECTION`, `LAST_ACTIVE_ADMINISTRATOR`, `USER_OWNS_NON_FINAL_TICKETS` | 409 |
| `LOGIN_THROTTLED` | 429 |
| `ATTACHMENT_REMOVED` | 410 |
| `FILE_TOO_LARGE` | 413 |
| `UNSUPPORTED_FILE_TYPE` | 415 |
| `INTERNAL_ERROR` | 500 |

Lab 2's existing validation/attachment codes (`NO_FILE`, `ATTACHMENT_LIMIT_REACHED`, `ALREADY_REMOVED`, and `ATTACHMENT_FILE_MISSING`) retain their documented status and behavior, subject to the new authentication/CSRF/finality guards.
