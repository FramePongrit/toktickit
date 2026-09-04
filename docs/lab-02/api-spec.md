# Lab 2 API Contract

**Base URL (development):** `http://localhost:3000`
**Content type:** `application/json` unless stated otherwise
**Related documents:** [specification.md](./specification.md) · [tests.md](./tests.md)

---

## 1. Conventions

### 1.1 Identity

Every request to `/api/tickets*` and `/api/attachments*` must carry the header:

```
X-Requester-Id: <positive integer>
```

The header is resolved by a single middleware, `requireRequester`. Route handlers read the identity only from what that middleware attaches to the request; none of them parses the header itself. In Lab 3 the middleware's body is replaced with token verification and no route handler changes (BR-47, BR-48).

The three reference-data endpoints deliberately do **not** require the header, because the Development Requester Selection screen must be usable before any Requester has been chosen.

### 1.2 Error body

Every non-2xx response uses one shape, emitted by a single centralised error handler:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Ticket data is invalid.",
    "details": [
      { "field": "summary", "message": "Summary must be at least 5 characters." }
    ]
  }
}
```

`details` is present only for validation failures. `message` is safe to display to an end user: it never contains a stack trace, SQL, a file path, or an internal identifier (BR-27).

### 1.3 Response envelopes

Reference-data endpoints return **bare arrays**. `GET /api/tickets` is the **only** enveloped endpoint. This is deliberate: only the ticket list needs pagination metadata, and `GET /api/categories` must keep the exact response shape that the existing Lab 1 test asserts.

### 1.4 Timestamps

All timestamps are ISO 8601 strings in UTC, for example `"2026-09-04T14:22:31.442Z"`.

---

## 2. Identity middleware behaviour

`requireRequester` resolves `X-Requester-Id` before any protected handler runs.

| Condition | Status | `error.code` | Reasoning |
|---|---|---|---|
| Header absent | 401 | `REQUESTER_HEADER_MISSING` | No identity was presented at all. |
| Header present but not a positive integer | 400 | `REQUESTER_HEADER_INVALID` | The request is malformed, which is a client error distinct from a failed identification. |
| Header is a valid integer but no such `RequesterUser` exists | 401 | `REQUESTER_NOT_FOUND` | An identity was presented and could not be resolved. |
| `RequesterUser` exists but `active = false` | 403 | `REQUESTER_INACTIVE` | Identity *resolved* but is not permitted. Lab 3 preserves this distinction for free: a valid token belonging to a deactivated account is exactly this case. |

On success the middleware attaches `{ id, fullName, email }` to the request.

---

## 3. Ownership failures return 404

Every read or write of a Ticket or Attachment that the caller does not own returns **404 Not Found** with code `TICKET_NOT_FOUND` or `ATTACHMENT_NOT_FOUND` — the same response a genuinely nonexistent id produces.

**Why not 403.** A 403 confirms that the resource exists. Requester B could then walk `/api/tickets/1`, `/api/tickets/2`, … and, purely from the difference between 403 and 404, reconstruct exactly which ticket ids Requester A owns — how many tickets they have and roughly when they were created. 404 leaks nothing, because "not yours" and "not there" are indistinguishable.

This is implemented as a `where` clause rather than a post-fetch check:

```ts
prisma.ticket.findFirst({ where: { id, requesterId: req.requester.id } })
```

There is therefore no code path that loads another Requester's row into memory before deciding to refuse it.

**One exception, deliberately made:** requesting the download of an attachment the caller *does* own but which has been removed returns **410 Gone**, not 404. The existence of that attachment is already disclosed to its own owner through the ticket detail response, so nothing leaks, and 410 lets the client show a precise message instead of a generic one.

---

## 4. Reference data

### 4.1 `GET /api/categories`

Lists active Categories. **No identity header required.** The response shape is unchanged from Lab 1; only the `where` clause is new.

**200**
```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```

Filtered to `active = true`, ordered by `id` ascending.

### 4.2 `GET /api/related-systems`

Lists active Related Systems. No identity header required.

**200**
```json
[
  { "id": 7, "name": "Campus Wi-Fi" },
  { "id": 8, "name": "Corporate Laptop" },
  { "id": 1, "name": "Email" }
]
```

Filtered to `active = true`, ordered by `name` ascending.

### 4.3 `GET /api/dev-requesters`

Lists active Development Requesters. No identity header required — this endpoint *is* the selection screen's data source.

**200**
```json
[
  { "id": 1, "fullName": "Jennifer Anderson", "email": "jennifer.anderson@kmutt.ac.th", "department": "Faculty of Engineering" },
  { "id": 2, "fullName": "Michael Brown",     "email": "michael.brown@kmutt.ac.th",     "department": "Registrar" }
]
```

Filtered to `active = true`, ordered by `fullName` ascending. The inactive Requester is excluded **server-side**, not by client filtering, so the exclusion cannot be bypassed (BR-06).

An empty array is a valid response and drives the selector's empty state (BR-09).

---

## 5. Tickets

### 5.1 `POST /api/tickets` — create a Ticket

Requires `X-Requester-Id`.

**Request**
```json
{
  "categoryId": 2,
  "relatedSystemId": 8,
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle. This started after last week's Windows update."
}
```

**Validation**

| Field | Rule |
|---|---|
| `categoryId` | Required. Positive integer. Must reference an existing Category with `active = true`. |
| `relatedSystemId` | Required. Positive integer. Must reference an existing RelatedSystem with `active = true`. |
| `requestedPriority` | Required. One of `LOW`, `MEDIUM`, `HIGH`, `URGENT`. |
| `summary` | Required. Trimmed. 5–200 characters after trimming. |
| `description` | Required. Trimmed. 10–5000 characters after trimming. |

`ticketNumber`, `currentStatus`, `requesterId`, and the timestamps are system-generated. If the client sends them they are ignored (BR-04).

An unknown or inactive `categoryId` / `relatedSystemId` is a **400 validation failure**, not a 404 — the fault is in a submitted field value, so it belongs alongside the other field errors the form renders (D-09).

**201** — returns the full ticket detail object (§5.3).

**Errors**

| Status | Code | Condition |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Any rule above fails. `details` names each offending field. |
| 400 | `REQUESTER_HEADER_INVALID` | Malformed identity header. |
| 401 | `REQUESTER_HEADER_MISSING` / `REQUESTER_NOT_FOUND` | See §2. |
| 403 | `REQUESTER_INACTIVE` | See §2. |
| 500 | `INTERNAL_ERROR` | Unexpected failure. |

**Ticket Number allocation.** Inside one transaction the server ensures a `TicketCounter` row exists for the current year (`INSERT … ON CONFLICT DO NOTHING`), then allocates:

```sql
UPDATE "TicketCounter" SET "lastValue" = "lastValue" + 1 WHERE "year" = $1 RETURNING "lastValue"
```

and inserts the Ticket in that same transaction. The `UPDATE … RETURNING` holds a row lock on the year row for the life of the transaction, so concurrent creates serialise on it and every allocation is distinct and gap-free without any retry loop. `MAX(ticketNumber) + 1` was rejected because two concurrent readers can observe the same maximum — a real race that passes tests only by luck — and a PostgreSQL sequence was rejected because it cannot restart per calendar year without extra operational machinery. The `@unique` constraint on `ticketNumber` remains as defence in depth. The format is `TKT-<YYYY>-<NNNNNN>`, six digits zero-padded, restarting at `000001` each year.

### 5.2 `GET /api/tickets` — list the caller's Tickets

Requires `X-Requester-Id`. Returns **only** tickets owned by the resolved Requester.

**Query contract**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | **1-based.** `page=0` is an error, not page 1. |
| `pageSize` | one of `10`, `20`, `50` | `10` | Any other value is an error. |
| `q` | string, ≤ 100 chars | — | Case-insensitive substring match against `ticketNumber` **or** `summary`. |
| `categoryId` | integer | — | Exact match filter. |
| `relatedSystemId` | integer | — | Exact match filter. |
| `priority` | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` | — | Exact match filter on `requestedPriority`. |
| `sort` | `createdAt` \| `ticketNumber` \| `requestedPriority` \| `summary` | `createdAt` | Whitelist. Any other value is an error. |
| `order` | `asc` \| `desc` | `desc` | |

`requesterId` is **never** accepted as a query parameter. Ownership comes from the middleware alone — that is the entire point of enforcing it in the backend (BR-16).

Filters combine conjunctively (BR-15). Invalid parameters produce **400** with field-level `details`; values are never silently clamped or corrected, because silent correction cannot be asserted by a test (BR-20).

**Sorting.** `id` descending is appended to every `orderBy` as a secondary key. Without it, tickets that tie on the primary sort value can shift between pages, so one ticket appears on two pages and another on none — a defect that only surfaces once real pagination is exercised (BR-18).

Sorting by `requestedPriority` orders by the PostgreSQL enum's declaration order — `LOW`, `MEDIUM`, `HIGH`, `URGENT` — which is why the enum is declared in severity order rather than alphabetically.

**200**
```json
{
  "data": [
    {
      "id": 42,
      "ticketNumber": "TKT-2026-000042",
      "summary": "Laptop battery drains quickly",
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "createdAt": "2026-09-04T09:14:00.000Z",
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 8, "name": "Corporate Laptop" },
      "attachmentCount": 2
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 37,
  "totalPages": 4
}
```

`attachmentCount` counts **active** attachments only. `data` and `total` are computed in one transaction so the count always matches the page that was returned.

An empty result is `{ "data": [], "page": 1, "pageSize": 10, "total": 0, "totalPages": 0 }` and is a **200**, not a 404. The client distinguishes the empty state from the no-results state by whether any filter is active (BR-41, BR-42).

**Errors:** 400 `VALIDATION_FAILED` for any bad parameter; the identity errors of §2; 500.

### 5.3 `GET /api/tickets/:id` — retrieve one owned Ticket

Requires `X-Requester-Id`.

**200**
```json
{
  "id": 42,
  "ticketNumber": "TKT-2026-000042",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW",
  "createdAt": "2026-09-04T09:14:00.000Z",
  "updatedAt": "2026-09-04T09:14:00.000Z",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 8, "name": "Corporate Laptop" },
  "requester": {
    "id": 1,
    "fullName": "Jennifer Anderson",
    "email": "jennifer.anderson@kmutt.ac.th",
    "department": "Faculty of Engineering"
  },
  "attachments": [
    {
      "id": 11,
      "originalFilename": "battery-report.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 184320,
      "uploadedAt": "2026-09-04T09:15:10.000Z",
      "isRemoved": false,
      "removedAt": null,
      "removalReason": null
    },
    {
      "id": 12,
      "originalFilename": "screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 402118,
      "uploadedAt": "2026-09-04T09:16:02.000Z",
      "isRemoved": true,
      "removedAt": "2026-09-04T10:02:44.000Z",
      "removalReason": "Uploaded the wrong screenshot"
    }
  ]
}
```

Removed attachments **are** included, flagged `isRemoved: true`, because the labsheet requires removed attachments to remain visible as metadata (BR-33). The client renders them greyed with no download affordance.

**Errors**

| Status | Code | Condition |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `:id` is not a positive integer. |
| 404 | `TICKET_NOT_FOUND` | No such ticket, **or** it belongs to another Requester. See §3. |
| — | — | Plus the identity errors of §2, and 500. |

---

## 6. Attachments

### 6.1 `POST /api/tickets/:id/attachments` — upload

Requires `X-Requester-Id`. `Content-Type: multipart/form-data` with a single file field named `file`.

**Guards, applied in this order**

1. **Ownership** — the ticket must belong to the caller, else 404.
2. **Size** — 5 MB maximum, enforced by the upload middleware's limit.
3. **Type** — the extension must be one of `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf` **and** the declared MIME type one of `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Either check failing rejects the upload.
4. **Active count** — the ticket must have fewer than 5 active attachments, counted and inserted inside one transaction.

**Storage.** The stored filename is `randomUUID()` plus the lowercased original extension. The Requester's filename is kept only as display metadata and is never used to construct a path, so a filename such as `../../etc/passwd` cannot escape the upload directory (BR-36). The upload directory is never exposed through static file serving; every read goes through §6.3 (BR-37).

**201** — returns the attachment metadata object shown in §5.3.

**Errors**

| Status | Code | Condition |
|---|---|---|
| 400 | `NO_FILE` | No file part was present in the request. |
| 404 | `TICKET_NOT_FOUND` | The ticket does not exist or is not the caller's. |
| 409 | `ATTACHMENT_LIMIT_REACHED` | The ticket already has 5 active attachments. |
| 413 | `FILE_TOO_LARGE` | The file exceeds 5 MB. |
| 415 | `UNSUPPORTED_FILE_TYPE` | Extension or MIME type not permitted. |

**Orphan cleanup.** The upload middleware writes the file to disk before the handler runs, so a rejection at guard 3 or 4 leaves a file with no row. Every rejection path deletes that file before responding (BR-40).

**Relationship to ticket creation.** Attachment upload is a separate operation from `POST /api/tickets`. If a ticket is created and a subsequent upload fails, the ticket is retained and the Requester is told which attachment failed; the ticket is never rolled back (BR-39). This is the compensation strategy: rather than a distributed transaction across the database and the filesystem, the two operations are independently retryable and the orphan case is cleaned up explicitly.

### 6.2 `GET /api/attachments/:id` — metadata

Requires `X-Requester-Id`. Ownership is resolved through the attachment's parent ticket.

**200** — the attachment metadata object of §5.3. Works for removed attachments too, since their metadata remains visible.

**Errors:** 400 for a non-integer id; 404 `ATTACHMENT_NOT_FOUND` if it does not exist or its ticket is not the caller's; identity errors; 500.

### 6.3 `GET /api/attachments/:id/download` — download an active Attachment

Requires `X-Requester-Id`.

**200** — the file content, with:

```
Content-Type: <stored mimeType>
Content-Disposition: attachment; filename="<originalFilename>"
Content-Length: <sizeBytes>
X-Content-Type-Options: nosniff
```

**Errors**

| Status | Code | Condition |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `:id` is not a positive integer. |
| 404 | `ATTACHMENT_NOT_FOUND` | Does not exist, or the parent ticket is not the caller's. |
| 410 | `ATTACHMENT_REMOVED` | The attachment was soft-removed. No content is returned. |
| 500 | `ATTACHMENT_FILE_MISSING` | The metadata row exists but the file is absent from disk. |

**Client note.** The client cannot download this with a plain `<a href>`: an anchor navigation cannot set the `X-Requester-Id` header, and the API is on a different origin from the dev server. The client therefore fetches the URL with the header, converts the response to a blob, creates an object URL, clicks a synthetic anchor, and revokes the object URL afterwards. The filename comes from the metadata the client already holds, which avoids needing to expose `Content-Disposition` through CORS (D-06).

### 6.4 `PATCH /api/attachments/:id/remove` — soft removal

Requires `X-Requester-Id`.

**Request**
```json
{ "removalReason": "Uploaded the wrong screenshot" }
```

`removalReason` is required, trimmed, 3–200 characters.

**Effect.** Sets `removedAt` to now, `removedByRequesterId` to the caller, and `removalReason` to the supplied text. **The file on disk is not deleted** — soft removal revokes access, it does not destroy the record or the bytes (BR-32).

**200** — the updated attachment metadata, now with `isRemoved: true`.

**Errors**

| Status | Code | Condition |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Missing, too short, or too long `removalReason`. |
| 404 | `ATTACHMENT_NOT_FOUND` | Does not exist, or the parent ticket is not the caller's. |
| 409 | `ALREADY_REMOVED` | The attachment is already removed. |

**Why `PATCH … /remove` and not `DELETE`.** The resource is not deleted and remains addressable through §6.2 afterwards. A `DELETE` would lead a reader of the API to expect a subsequent 404, which is precisely the behaviour this endpoint does *not* have. Returning 409 rather than a silently idempotent 200 makes a double submission visible rather than hidden (BR-35).

---

## 7. Status code summary

| Status | Used for |
|---|---|
| 200 | Successful retrieval or update |
| 201 | Ticket or Attachment created |
| 400 | Malformed input: validation failure, bad path parameter, bad query parameter, malformed identity header |
| 401 | No identity presented, or the presented identity could not be resolved |
| 403 | Identity resolved but the Requester is inactive |
| 404 | Resource does not exist, **or** is not owned by the caller (§3) |
| 409 | State conflict: attachment limit reached, attachment already removed |
| 410 | The attachment exists and is the caller's, but has been removed |
| 413 | Uploaded file exceeds 5 MB |
| 415 | Uploaded file type is not permitted |
| 500 | Unexpected server error, or a stored file is missing from disk |

## 8. Error code index

| Code | Status |
|---|---|
| `REQUESTER_HEADER_MISSING` | 401 |
| `REQUESTER_HEADER_INVALID` | 400 |
| `REQUESTER_NOT_FOUND` | 401 |
| `REQUESTER_INACTIVE` | 403 |
| `VALIDATION_FAILED` | 400 |
| `TICKET_NOT_FOUND` | 404 |
| `ATTACHMENT_NOT_FOUND` | 404 |
| `NO_FILE` | 400 |
| `FILE_TOO_LARGE` | 413 |
| `UNSUPPORTED_FILE_TYPE` | 415 |
| `ATTACHMENT_LIMIT_REACHED` | 409 |
| `ALREADY_REMOVED` | 409 |
| `ATTACHMENT_REMOVED` | 410 |
| `ATTACHMENT_FILE_MISSING` | 500 |
| `ROUTE_NOT_FOUND` | 404 |
| `INTERNAL_ERROR` | 500 |

## 9. Known limitations

- Attachment type validation trusts the file extension and the client-declared MIME type. Neither is authoritative; magic-byte inspection is out of scope for Lab 2 (D-11).
- Substring search performs a sequential scan. Appropriate at course data volumes; a trigram index would be premature optimisation.
- "At most 5 active attachments" is enforced by the application inside a transaction, not by a database constraint, because a count is not expressible as a unique index.
- There is no rate limiting. Out of scope for Lab 2.
