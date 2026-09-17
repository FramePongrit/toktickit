# Lab 3 UI Specification - Zen Green Extension

**Related documents:** [specification](./specification.md) · [API contract](./api-spec.md) · [test plan](./tests.md) · [Lab 2 UI foundation](../lab-02/ui-spec.md)

Lab 3 extends the established Zen Green tokens, typography, spacing, form states, button hierarchy, badges, and accessibility rules; it does not create a second visual system. The Lab 2 Development Requester Selector and Change Requester action are removed.

## 1. Shared presentation and interaction rules

- Reuse Lab 2 `--zen-*` colour tokens, cards, `FormField`, badges, `StateBlock`, pagination, and 44x44 px minimum touch targets. Status, Requested Priority, IT Priority, and Role badges contain text as well as colour.
- Editable controls have white backgrounds; system/read-only values use `--zen-readonly-bg` and are not merely disabled. Required labels have an accessible required marker; messages occur directly below their offending field with `aria-invalid` and `aria-describedby`.
- Every async region has a polite live status; validation and safe failure use an assertive live region. Busy controls show a progress label and prevent duplicate submission. Retry retains meaningful query/form state; successful mutation has text plus non-colour visual feedback.
- Errors are safe contract messages. `401` returns to Login after clearing in-memory state; `403 PASSWORD_CHANGE_REQUIRED` routes to Change Password; `403 FORBIDDEN`, `404`, and `409` have dedicated explanatory states without exposing hidden data.
- Dialogs label/describe themselves, trap focus, close on Escape where safe, return focus to their trigger, and have explicit Cancel. Keyboard focus is visible everywhere. Plain-text comments/notes are displayed as text, never HTML.

## 2. Application shell and route behavior

Header: TokTickIT at left, permitted navigation in the middle, current full name plus Role badge and Logout at right. `My Tickets` and `Create Ticket` appear for Requesters; `Staff Queue` for Staff/Admin; `User Management` only for Admin. Change Password is available to all authenticated Roles. No unauthorized destination is presented, but direct navigation remains protected by the API and client route guard.

At `<768px`, the navigation becomes an accessible menu toggle; after a navigation selection it closes and focus lands on the page heading. At Mandatory Password Change, the shell exposes only Change Password and Logout; normal routes redirect to Change Password. On every full reload the shell calls credentialed `GET /api/auth/me`; its `user` and `csrfToken` response hydrates in-memory state before any mutation control enables. The token is not persisted in storage. A successful password change replaces it with the returned new-session token; Logout clears it before route change. Loading `GET /api/auth/me` renders a neutral boot/loading screen rather than briefly showing stale identity/navigation.

## 3. Login and Change Password

### 3.1 Login (`/login`)

Centred card (max 480px): TokTickIT identity, heading "Sign in", Email and Password fields, Sign in primary action, and a local-development help note with no real credentials/secrets. Do not include self-registration, forgot-password, remember-me, or social-login controls.

| Mode | Presentation |
| --- | --- |
| Initial | Email autofocus; password type `password`; labelled fields and Sign in enabled. |
| Client validation | Inline email/required messages, focus first invalid field; API is not called. |
| Signing in | Both inputs/action disabled, spinner and "Signing in..."; password remains masked. |
| Invalid credentials | One safe non-enumerating message: "Email or password is incorrect." Preserve normalized email but clear password and focus it. |
| Inactive | Safe message: "This account is inactive. Contact an administrator." No account/Role details. |
| Throttled | Explain to wait and retry later; retain email, clear password. |
| Retryable failure | Safe message and Retry; do not leak network/server internals. |
| Success | Route by current Role, or to Change Password when `mustChangePassword` is true. |

### 3.2 Change Password (`/change-password`)

Card: explanation whether this is mandatory first-login change; Current Password, New Password, Confirm New Password; displayed password rules; Save New Password primary and Logout secondary. Password fields never repopulate after submit/failure.

| Mode | Presentation |
| --- | --- |
| Initial | Normal route permits all authenticated Users; mandatory route explains normal features remain unavailable. |
| Validation | Inline length/letter/digit/current-match/confirmation errors; no sensitive value shown. |
| Saving | Form disabled with "Saving password...". |
| Current password rejected | Safe inline/form message; clear current-password input only. |
| Success | Announce success, refresh current User/session/CSRF state, then route Role landing. |
| Failure | Safe retry feedback; New/Confirm cleared before retry. |

## 4. Requester continuation

`/tickets`, `/tickets/new`, and `/tickets/:id` retain the Lab 2 layouts, validation, Attachment states, list filtering/pagination, responsive cards, and Zen Green visual contract. Current Requester display uses authenticated full name; no selector state/storage/header exists. Lab 2 Ticket Detail adds the following after Attachments.

### 4.1 Public Comments

Card heading **Public comments** with a short disclosure: "Visible to you and TokTickIT staff." Timeline uses author name, Role badge, timestamp, and text. Composer has a labelled textarea, remaining-character helper, and **Post public comment** action. It is visually a green-accented public card; it must never resemble Internal Notes. On a Final Ticket, historical comments remain readable but the composer is replaced with the finality explanation.

### 4.2 Resolution Indication

For an eligible Non-final Ticket that is not Resolved and has no indication, show **Problem appears resolved** as a secondary action with confirmation: "This tells IT the problem appears resolved. It does not close the Ticket." On success show a textual/timestamp indication badge and disable the action. A 409 refreshes current Ticket state and says it was already recorded or is no longer eligible; this action never shows status controls. On a Resolved Ticket, replace only the Resolution Indication action with an explanation that the Ticket is already formally Resolved; the Public Comment timeline and composer remain available. On a Final Ticket, the timeline remains readable but both the Public Comment composer and Resolution Indication are replaced by the finality explanation.

Requester modes: loading, comments loading, empty timeline, comment validation/busy/success/failure, indication confirmation/busy/already-indicated/failure, Ticket not found, and final read-only. An Internal Notes region is never rendered or requested for Requesters.

## 5. Staff Queue (`/staff/tickets`)

Page header: **Ticket Queue**, active/all scope segmented control, and one-line scope description. Filter bar: labelled Search (Ticket Number, Summary, Requester name/email), Status, IT Priority, Category, Owner (All, My Tickets, Unassigned, eligible user), Sort, Order, page size, and Clear Filters. On Staff/Admin entry, the Owner user options load from `GET /api/staff/ticket-owners`, not from visible Queue rows or the Administrator Users route. The select shows each safe `fullName` plus Role badge, sends only its `id` as `owner`, and has separate loading/retry/forbidden feedback; All/My/Unassigned remain operable while that directory reloads. Changes reset page to 1 and preserve query state in the URL (`scope`, `q`, `status`, `itPriority`, `categoryId`, `owner`, `sort`, `order`, `page`, `pageSize`) for reproducible navigation. Debounce Search; filters combine visibly as AND.

Desktop (`>=992px`) uses a readable seven-column table: Ticket/date; Summary/requester; Category; Requested + IT Priority; Status; Owner; Updated/open action. Ticket Number and **Open** reach Detail. Sortable headers expose `aria-sort`; an empty owner reads **Unassigned**. Resolution Indication is text-plus-icon/badge, never colour alone.

Tablet (`768-991px`) may use the same table only if all seven columns remain readable; otherwise it uses cards. Mobile (`<768px`) always uses cards: Ticket/date, summary, requester, category, both priority badges, status, owner, indication, updated date, Open. No horizontal page scroll is allowed.

| Mode | Presentation |
| --- | --- |
| Loading | Skeleton table rows/cards while filters remain operable. |
| Empty | "No Tickets in this scope." Explain Active versus All; no Clear Filters implication. |
| No results | "No Tickets match these filters." with Clear Filters. |
| Loaded | Deterministic rows/cards, result range, total, and accessible pagination boundaries. |
| Forbidden | Safe role-access message and role-appropriate route action. |
| Failure | Safe message plus Retry retaining current URL query. |

## 6. Staff Ticket Detail (`/staff/tickets/:id`)

Breadcrumb `Staff Queue > Ticket Details`; title with Ticket Number/current Status. Separate cards prevent accidental conflation of independent operations:

1. **Ticket and Requester information**: Lab 2 classification/description as read-only; Requester name/email; Requested Priority as read-only badge.
2. **Ownership**: current owner or Unassigned; Claim appears only to an Unassigned Ticket and is disabled/busy during request. Reassign appears only when a current Owner exists and opens an accessible dialog with an eligible active Staff/Admin select populated from `GET /api/staff/ticket-owners`, not from visible owners or `GET /api/admin/users`. The dialog handles Owner-directory loading/retry/forbidden separately, renders only safe name/Role choices, requires one selected target and confirmation, and refreshes detail on conflict; it is never offered for an Unassigned Ticket.
3. **IT Priority**: a labelled editable select plus distinct **Save IT Priority** action; Requested Priority remains visibly read-only.
4. **Status**: current status, only API-permitted next-status choices, and **Update status**. Selecting Waiting for Requester reveals a required Public Comment textarea. Resolved, Closed, Cancelled, and Reopened open a confirmation dialog before the API mutation. Closed confirmation explicitly says it is Final; there is no reopen control on Closed/Cancelled.
5. **Resolution Indication**: prominent contextual banner, including timestamp/requester, so Staff can act deliberately. It clears on successful Reopened refresh.
6. **Public comments**: green public timeline/composer labelled "Visible to Requester and staff".
7. **Internal notes**: visually distinct amber/neutral restricted card with lock icon and text "Visible only to IT Staff and Administrators". It has a separately labelled composer/action and must not share a submit button/form with Public Comments.
8. **Attachments**: existing metadata and active Download action; no Staff upload/remove action. Removed metadata is greyed and has no download.

Each independent action owns loading/busy/success/validation/conflict/forbidden/failure feedback; one operation cannot disable unrelated safe reading/actions. On `TICKET_ALREADY_ASSIGNED`, reload detail and display `error.meta.owner`. On `TICKET_OWNER_REQUIRED`, explain Claim/Reassign must happen before status update. When the API returns `TICKET_FINAL`, it takes precedence over local field validation/conflict messaging: refresh/read the Final detail and show the terminal read-only explanation. Final Ticket Detail displays all history/metadata, including Public Comments and restricted Internal Notes, but hides/disables Claim, Reassign, Save IT Priority, status, and both composers with a clear "Closed/Cancelled Tickets are read-only" message.

## 7. User Management (`/admin/users`)

Header **User Management** with Search, one Role filter, and **Create User**. Desktop (`>=768px`) table: Name, Email, Role badge, Status (Active/Inactive text badge), Edit. Smaller widths use cards with same information and an Edit action; no page-level overflow.

### 7.1 Create dialog

Labelled full name, email, exactly one Role select, active checkbox, Initial Password, confirmation, Cancel, and Create User. It explains the User must change the Initial Password before normal access. Client/server validation renders under fields; duplicate email uses a field-level safe message. On success close dialog, announce success, refresh list, and return focus to Create User. Password inputs are cleared on every close/submission and never rendered from response.

### 7.2 Edit dialog

Name, email, Role, active state, Save changes, Cancel, plus an explicitly separate **Reset Initial Password** action. An Administrator editing their own account may change name/email; their Role and active controls plus reset action are disabled with explanatory text. Reset opens a nested/replacement confirmation dialog with new Initial Password and confirmation; it states the target will need a new password at next Login and existing sessions will end. API conflicts are still handled. Last-admin conflicts state the safe corrective action (retain another active Administrator); `USER_OWNS_NON_FINAL_TICKETS` displays only `error.meta.nonFinalOwnedTicketCount` and explains that non-final Tickets must be reassigned, without leaking Ticket detail.

| Mode | Presentation |
| --- | --- |
| Loading | Table/card skeleton. |
| Empty | "No Users found." Create User remains available. |
| No results | Search/filter-specific wording and Clear Filters. |
| Create/Edit validation | Per-field messages; keep nonsensitive entered fields. |
| Saving/resetting | Relevant dialog controls disabled with busy wording. |
| Success | Textual live confirmation and refreshed list. |
| Forbidden | Route guard feedback; API response remains authority. |
| Conflict/failure | Safe conflict/failure explanation, dialog stays open where correction is possible. |

## 8. Responsive and accessibility acceptance

At **1440x900**, **820x1024**, and **390x844**, inspect Login, Change Password/shell, requester detail extension, Staff Queue, Staff Detail, and User Management. Confirm:

- no page-level horizontal overflow, clipping, overlap, unreadable grid, hidden primary action, or truncated error;
- headers/navigation work at touch size, card/table switch remains readable, and long Ticket/User values wrap or ellipsize with accessible full text;
- tab order, visible focus, labels, required/invalid ARIA, live status, dialogs/return focus, and no-colour-only meaning work;
- every meaningful loading, busy, success, validation, empty/no-results, forbidden/not-found, conflict, final/read-only, and retryable-failure state above is represented and tested.

## 9. Screenshot/evidence contract

Issue 16 creates only deterministic evidence under:

```text
artifacts/lab-03/screenshots/
  authentication/       # login invalid/inactive/busy, change-password, shell/logout, all viewports
  staff-queue/          # loaded/filter/no-results/pagination, all viewports
  staff-ticket-detail/  # staff detail and requester-ticket-detail states, all viewports
  user-management/      # list/dialog/validation/conflict, all viewports
```

Requester Ticket Detail evidence is stored within the handout-required `staff-ticket-detail/` folder rather than creating a fifth artifact group: `requester-ticket-detail-{desktop,tablet,mobile}.png` plus comment/indication/final-state captures. The final visual checklist in `tests.md` is completed only from integrated-branch evidence; this contract intentionally records planned requirements rather than claiming screenshots already pass.
