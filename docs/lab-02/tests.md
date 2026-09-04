# Lab 2 Test Plan and Results

**Related documents:** [specification.md](./specification.md) · [api-spec.md](./api-spec.md) · [ui-spec.md](./ui-spec.md)

This plan was written from the specification **before** implementation. It is the evidence contract: the coding agent may not report the work complete until every planned test exists, runs, and passes for the reason it was written.

---

## 1. Test Strategy

**Levels and what each is responsible for**

| Level | Tool | Responsibility |
|---|---|---|
| Unit | Vitest | Pure logic with no I/O: ticket number formatting, query-parameter parsing, attachment type checking |
| API / integration | Vitest + Supertest | The HTTP contract against a real PostgreSQL database: status codes, response shapes, validation, ownership, transactions |
| UI component | Vitest + React Testing Library | Screen behaviour with the API layer stubbed: states, validation placement, disabled and busy controls |
| UI style | Vitest + RTL, plus Playwright screenshots | Required classes, field states, labels, asterisks, message placement, badge consistency |
| Responsive | Playwright at three viewports | Layout at 1440, 820, and 390 px; absence of horizontal page scrolling |
| End-to-end | Playwright | The complete Requester journey across a real client, real API, and real database |

**Ownership is tested from the outside.** Every ownership rule is asserted at the API level with a second Requester's header, not by inspecting client state. A client-side filter would pass a component test while leaving the data readable — so the API test is the one that counts.

**Test data discipline.** Server test files run sequentially against the shared development database (`fileParallelism: false`), because four suites mutating one database in parallel interfere with each other. Each Lab 2 suite creates its **own** `RequesterUser` rows with randomised email suffixes, creates every ticket under those ids, asserts only about its own data, and deletes only its own rows in FK order (attachments → tickets → requesters) plus any files it uploaded. Shared reference tables are never truncated: the Lab 1 `categories.test.ts` asserts Category ids 1–4, and truncating would restart the identity sequence and break a graded Lab 1 test.

**Mock discipline.** Client suites stub the API modules with `vi.spyOn` on the specific module under test. `restoreMocks: true` is enabled so spies cannot leak between tests. The API layer is never re-exported through a barrel, because `vi.spyOn` cannot redefine an ESM re-exported binding — doing so would break the existing Lab 1 test as well as the new ones.

---

## 2. Planned Tests

Status column: `Planned` until implemented, then `Pass`.

### 2.1 Unit

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01, AC-09 | Ticket number formatter | `format(2026, 42)` returns `TKT-2026-000042` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| UNIT-02 | Unit | BR-19, BR-20 | Ticket list query schema | `pageSize=7` and `page=0` are rejected; defaults applied when absent | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| UNIT-03 | Unit | BR-29 | Attachment type check | Permitted extension + MIME accepted; either one wrong rejected | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| UNIT-04 | Unit | BR-21, BR-22 | Trimming before validation | `"  hi  "` fails the 5-character minimum after trimming | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |

### 2.2 API — create ticket

File: `server/tests/lab-02/create-ticket.api.test.ts`

| Test ID | Type | Requirement / AC | What it tests | Expected result | Final |
|---|---|---|---|---|---|
| API-01 | API | AC-07 | Create with valid data | 201; one ticket saved; ticket number returned | Pass |
| API-02 | API | AC-08 | Defaults and ownership on create | `currentStatus = NEW`; `requesterId` matches the header | Pass |
| API-03 | API | AC-09 | Ticket number format | Matches `/^TKT-\d{4}-\d{6}$/` with the current year | Pass |
| API-04 | API | AC-10, BR-05 | Concurrent creation | 8 parallel creates return 8 distinct ticket numbers | Pass |
| API-05 | API | AC-12, BR-21 | Summary too short | 400 `VALIDATION_FAILED`; `details` names `summary` | Pass |
| API-06 | API | BR-22 | Description too short | 400; `details` names `description` | Pass |
| API-07 | API | BR-21 | Summary over 200 characters | 400; `details` names `summary` | Pass |
| API-08 | API | BR-23 | Missing required fields | 400; every missing field appears in `details` | Pass |
| API-09 | API | BR-23 | Invalid priority value | 400; `details` names `requestedPriority` | Pass |
| API-10 | API | AC-16, D-09 | Inactive or unknown `categoryId` | 400, **not** 404; `details` names `categoryId` | Pass |
| API-11 | API | BR-04 | Client-supplied `ticketNumber` and `currentStatus` | Ignored; server values used instead | Pass |
| API-12 | API | AC-43 | Missing identity header | 401 `REQUESTER_HEADER_MISSING` | Pass |
| API-13 | API | §2 | Non-numeric identity header | 400 `REQUESTER_HEADER_INVALID` | Pass |
| API-14 | API | §2 | Unknown requester id | 401 `REQUESTER_NOT_FOUND` | Pass |
| API-15 | API | AC-44, BR-06 | Inactive requester id | 403 `REQUESTER_INACTIVE` | Pass |

### 2.3 API — my tickets

File: `server/tests/lab-02/my-tickets.api.test.ts`

| Test ID | Type | Requirement / AC | What it tests | Expected result | Final |
|---|---|---|---|---|---|
| API-16 | API | AC-17, BR-11 | Ownership isolation | Requester B's list contains no ticket owned by A | Pass |
| API-17 | API | BR-16 | `requesterId` query parameter ignored | Supplying it cannot widen the result set | Pass |
| API-18 | API | AC-18, BR-14 | Search by ticket number | Case-insensitive substring match returns the ticket | Pass |
| API-19 | API | AC-19, BR-14 | Search by summary | Case-insensitive substring match returns the tickets | Pass |
| API-20 | API | AC-20 | Category filter | Every returned ticket has that Category | Pass |
| API-21 | API | FR-13 | Related System filter | Every returned ticket has that Related System | Pass |
| API-22 | API | FR-13 | Priority filter | Every returned ticket has that priority | Pass |
| API-23 | API | BR-15 | Combined filters | Filters combine conjunctively | Pass |
| API-24 | API | AC-21 | Sort by each whitelisted field, both orders | Ordering matches the request | Pass |
| API-25 | API | BR-17 | Default sort | Newest first when no sort is supplied | Pass |
| API-26 | API | AC-23, BR-18 | Stable pagination on tied sort values | Across consecutive pages no ticket repeats and none is skipped | Pass |
| API-27 | API | AC-22 | Pagination boundaries | Page 2 is disjoint from page 1; last page is partial; `total` is the full count | Pass |
| API-28 | API | AC-24, BR-19 | `pageSize=7` | 400, not a silently substituted size | Pass |
| API-29 | API | BR-19 | `page=0` | 400 | Pass |
| API-30 | API | BR-20 | `sort=password` | 400 — the whitelist rejects it | Pass |
| API-31 | API | AC-25 | Requester with no tickets | 200 with `data: []`, `total: 0` | Pass |
| API-32 | API | §5.2 | `attachmentCount` | Counts active attachments only; removed ones excluded | Pass |

### 2.4 API — ticket detail

File: `server/tests/lab-02/ticket-detail.api.test.ts`

| Test ID | Type | Requirement / AC | What it tests | Expected result | Final |
|---|---|---|---|---|---|
| API-33 | API | AC-29 | Owner retrieves their ticket | 200 with every specified field present | Pass |
| API-34 | API | AC-28, BR-13 | **Non-owner retrieves a ticket** | **404**, not 403 — see the rationale note below | Pass |
| API-35 | API | AC-31 | Nonexistent ticket id | 404 with the same body shape as API-34 | Pass |
| API-36 | API | §5.3 | Non-numeric ticket id | 400 `VALIDATION_FAILED` | Pass |
| API-37 | API | BR-33 | Removed attachments in the detail | Present with `isRemoved: true` and the removal reason | Pass |
| API-38 | API | AC-43, AC-44 | Identity header cases | 401 / 400 / 401 / 403 as specified in api-spec §2 | Pass |

> **Rationale to keep in the test file as a comment.** API-34 asserts 404 rather than 403 deliberately. A 403 would confirm the ticket exists, letting one Requester enumerate ids to map another Requester's data. A reviewer expecting 403 should read BR-13 and api-spec §3 before treating this as a defect.

### 2.5 API — attachments

File: `server/tests/lab-02/attachments.api.test.ts`

| Test ID | Type | Requirement / AC | What it tests | Expected result | Final |
|---|---|---|---|---|---|
| API-39 | API | AC-32 | Upload each permitted type | 201 for JPEG, PNG, WEBP, and PDF | Pass |
| API-40 | API | AC-33, BR-30 | 6 MB file | 413 `FILE_TOO_LARGE`; no row and no file left behind | Pass |
| API-41 | API | AC-34, BR-29 | Disallowed extension | 415 `UNSUPPORTED_FILE_TYPE` | Pass |
| API-42 | API | BR-29 | Permitted extension with a disallowed MIME type | 415 — both checks must pass | Pass |
| API-43 | API | AC-35, BR-31 | Sixth active attachment | 409 `ATTACHMENT_LIMIT_REACHED` | Pass |
| API-44 | API | AC-36, BR-31 | Upload after removing one of five | 201 — removed attachments do not count | Pass |
| API-45 | API | BR-38 | Non-owner uploads | 404 `TICKET_NOT_FOUND` | Pass |
| API-46 | API | §6.1 | Request with no file part | 400 `NO_FILE` | Pass |
| API-47 | API | BR-36 | Filename `../../evil.png` | Stored under a generated UUID name inside the upload directory; original kept only as metadata | Pass |
| API-48 | API | BR-40 | Rejected upload cleanup | No orphan file remains after a 409 or 415 | Pass |
| API-49 | API | AC-37 | Download an active attachment | 200 with the correct `Content-Type` and the original filename in `Content-Disposition` | Pass |
| API-50 | API | AC-39, BR-33 | **Download a removed attachment** | **410 `ATTACHMENT_REMOVED`**; no content returned | Pass |
| API-51 | API | BR-38 | Non-owner downloads | 404 | Pass |
| API-52 | API | AC-38, BR-32 | Soft removal | 200; `removedAt`, `removalReason`, and remover recorded; row still present | Pass |
| API-53 | API | AC-40, BR-34 | Removal without a reason | 400 | Pass |
| API-54 | API | BR-34 | Removal reason of 2 characters | 400 | Pass |
| API-55 | API | AC-41, BR-35 | Removing twice | 409 `ALREADY_REMOVED` | Pass |
| API-56 | API | AC-42, BR-38 | Non-owner reads metadata or removes | 404 for both | Pass |
| API-57 | API | BR-32 | The file survives removal | The stored file is still on disk after a soft removal | Pass |

### 2.6 UI components

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-01, BR-06 | Selector lists active requesters only | Four active names rendered; the inactive one absent | `client/tests/lab-02/SelectRequester.test.tsx` | Pass |
| UI-02 | UI | AC-06, BR-09 | Selector empty and failure states | Empty message with Continue disabled; failure message with Retry | `client/tests/lab-02/SelectRequester.test.tsx` | Pass |
| UI-03 | UI | AC-11 | Submit with an empty Summary | Message rendered below the Summary field; the API is not called | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-04 | UI | AC-14, BR-25 | Busy state on submit | Submit disabled with a busy label; a second click creates nothing | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-05 | UI | AC-07 | Success state | The returned ticket number is displayed with confirming text, not colour alone | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | UI | AC-13, AC-15, BR-26 | Values preserved after failure | Every entered value still present after an API error | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-07 | UI style | BR-28, ui-spec §3 | Validation placement and ARIA | Message follows its field; `aria-invalid` and `aria-describedby` set | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | UI style | ui-spec §3 | Required asterisk | Every required label carries an asterisk, and it does not replace the message | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | UI style | ui-spec §3 | Read-only field styling | Read-only fields carry the read-only class and the `readonly` attribute | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-10 | UI | AC-25, BR-41 | Empty state | Invites creating a first ticket | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | UI | AC-26, BR-42 | No-results state | Distinct wording plus a Clear Filters action | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | UI | AC-27, FR-26 | List failure state | Safe message plus Retry | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-13 | UI | FR-12, FR-13 | Search and filter wiring | Changing a control issues a request with the expected parameters | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-14 | UI | FR-15 | Pagination controls | Page change requests the new page; the range and total are displayed | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-15 | UI style | ui-spec §5 | Badge consistency | Priority and status badges render text alongside colour | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-16 | UI | AC-29 | Detail renders read-only | Every specified field present and read-only | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-17 | UI | AC-30, BR-45 | Out-of-scope features absent | No comments, internal notes, actions taken, IT priority, or status control | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-18 | UI | AC-02, BR-46 | Guard without a selected requester | Redirects to the selection screen | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-19 | UI | BR-43 | No attachments | Explicit message rather than an empty region | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-20 | UI | AC-32 | Upload happy path | Selected file uploads and appears in the list | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-21 | UI | BR-29, BR-30 | Client-side pre-checks | Oversized and wrong-type files are rejected before any request | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-22 | UI | BR-31 | Limit reached | Upload control disabled with an explanation at 5 active | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-23 | UI | BR-33, ui-spec §7.4 | Removed attachment presentation | Greyed, reason shown, **no download and no remove action** | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-24 | UI | BR-34 | Removal dialog | Confirm disabled until a valid reason is entered | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-25 | UI | AC-03, AC-04, BR-08 | Shell and requester switching | Name displayed; switching clears the previous Requester's data | `client/tests/lab-02/AppShell.test.tsx` | Pass |

### 2.7 End-to-end and responsive

File: `e2e/lab-02/requester-ticket-flow.spec.ts`

| Test ID | Type | Requirement / AC | What it tests | Expected result | Final |
|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-05, AC-07 | Select requester → create ticket | The confirmation shows an official ticket number; the selection survives a reload | Pass |
| E2E-02 | E2E | AC-17, FR-11 | Find the ticket in My Tickets | The new ticket appears; search, a filter, and paging all locate it | Pass |
| E2E-03 | E2E | AC-32, AC-37, AC-38 | Attachment lifecycle | Upload, download, and remove-with-reason all succeed from the UI | Pass |
| E2E-04 | E2E | AC-04, AC-28 | Cross-requester isolation | After switching to Requester B, A's tickets are gone and navigating to A's ticket URL shows a not-found state | Pass |
| E2E-05 | Responsive | AC-45, FR-27 | Three viewports on all three screens | No horizontal page scrolling; no clipping or overlap; controls remain usable | Pass |
| E2E-06 | UI style | AC-46, AC-48 | Zen Green conformance | Header, primary action, read-only field, and error colours match the tokens; success conveys meaning without colour alone | Pass |
| E2E-07 | Responsive | ui-spec §7.3 | List representation switches | Table at ≥ 768 px, cards below | Pass |

Screenshots produced by the same run are written to `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`.

---

## 3. Acceptance-Criterion Traceability

Every acceptance criterion maps to at least one planned test.

| AC | Covered by |
|---|---|
| AC-01 | UI-01, E2E-01 |
| AC-02 | UI-18 |
| AC-03 | UI-25 |
| AC-04 | UI-25, E2E-04 |
| AC-05 | E2E-01 |
| AC-06 | UI-02 |
| AC-07 | API-01, UI-05, E2E-01 |
| AC-08 | API-02 |
| AC-09 | UNIT-01, API-03 |
| AC-10 | API-04 |
| AC-11 | UI-03 |
| AC-12 | API-05 |
| AC-13 | UI-06 |
| AC-14 | UI-04 |
| AC-15 | UI-06 |
| AC-16 | API-10 |
| AC-17 | API-16, E2E-02 |
| AC-18 | API-18 |
| AC-19 | API-19 |
| AC-20 | API-20 |
| AC-21 | API-24 |
| AC-22 | API-27 |
| AC-23 | API-26 |
| AC-24 | UNIT-02, API-28 |
| AC-25 | API-31, UI-10 |
| AC-26 | UI-11 |
| AC-27 | UI-12 |
| AC-28 | API-34, E2E-04 |
| AC-29 | API-33, UI-16 |
| AC-30 | UI-17 |
| AC-31 | API-35 |
| AC-32 | API-39, UI-20, E2E-03 |
| AC-33 | API-40 |
| AC-34 | API-41 |
| AC-35 | API-43 |
| AC-36 | API-44 |
| AC-37 | API-49, E2E-03 |
| AC-38 | API-52, E2E-03 |
| AC-39 | API-50 |
| AC-40 | API-53 |
| AC-41 | API-55 |
| AC-42 | API-56 |
| AC-43 | API-12, API-38 |
| AC-44 | API-15, API-38 |
| AC-45 | E2E-05 |
| AC-46 | E2E-06 |
| AC-47 | UI-07, E2E-05 |
| AC-48 | UI-05, UI-15, E2E-06 |

---

## 4. Responsive and Visual Checklist

Executed at 1440 × 900, 820 × 1024, and 390 × 844 against `ui-spec.md` §10 and the screenshots in `artifacts/lab-02/screenshots/`. The full checklist lives in ui-spec.md §10 and its outcome is recorded here on completion.

| Screen | 1440 × 900 | 820 × 1024 | 390 × 844 |
|---|---|---|---|
| Development Requester Selection | Pass | Pass | Pass |
| Create Ticket | Pass | Pass | Pass |
| My Tickets | Pass | Pass | Pass |
| Ticket Detail | Pass | Pass | Pass |

---

## 5. Test Commands

```bash
# Backend API and unit tests (requires a migrated + seeded PostgreSQL)
cd server
npx prisma migrate deploy
npx prisma db seed
npm test

# Frontend component and UI-style tests
cd client
npm test

# End-to-end, responsive, and screenshot capture (starts both servers)
npx playwright test
npm run screenshots
```

---

## 6. Final Results

Filled in when the sprint completes, with the terminal output pasted below each command.

| Suite | Command | Tests | Result |
|---|---|---|---|
| Server (lab-01 + lab-02) | `cd server && npm test` | — | Pending |
| Client (lab-01 + lab-02) | `cd client && npm test` | — | Pending |
| End-to-end | `npx playwright test` | — | Pending |

*(Paste the passing terminal output from the final `main` branch here.)*

---

## 7. Known Limitations and Deferred Tests

- **File type validation is not content-based.** Tests assert extension and declared MIME type only. A renamed executable with a permitted extension and a spoofed MIME type would pass. Magic-byte inspection is deferred beyond Lab 2 (D-11).
- **No load or performance testing.** The concurrency test (API-04) verifies correctness under parallel creation, not throughput.
- **Search performance is untested at scale.** Substring search is a sequential scan; acceptable at course data volumes.
- **Server tests share the development database** rather than using a per-run disposable one. Mitigated by sequential execution and per-suite data isolation, but a dedicated test database would be the stronger arrangement in a production project.
- **No accessibility audit tooling.** Accessibility is asserted through explicit ARIA and focus assertions in component tests rather than by an automated auditor such as axe.
- **No visual regression baselines.** Screenshots are captured for human inspection against ui-spec.md; they are not diffed automatically against stored baselines.
