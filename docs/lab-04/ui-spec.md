# Lab 4 UI Specification - Zen Green Completion

Status: approved stakeholder direction; UI implementation, screenshots and visual checks are pending. Sources of truth: [specification](specification.md), [API](api-spec.md), [test plan](tests.md). Reuse existing AppShell, StateBlock, FormField, Badges, Pagination, AttachmentSection, authentication and layout tokens. Keep React/Router/Bootstrap/Vite; no new design system or dependency is required.

## 1. Application shell and role navigation

| Role | Landing after successful login/password-change completion | Navigation |
|---|---|---|
| REQUESTER | /dashboard | Dashboard, My Tickets, Create Ticket, existing permitted profile/password/Logout |
| STAFF | /staff/dashboard | Dashboard, Ticket Queue, existing permitted profile/password/Logout |
| ADMIN | /staff/dashboard | Staff navigation plus User Management |

Existing /tickets, /tickets/new, /tickets/:id, /staff/tickets, /staff/tickets/:id and /admin/users remain direct links. Mandatory-password-change and auth restore guards run before role landing. Show authenticated name/role and active navigation with text/aria-current, not color alone. Unauthorized destinations remain absent and direct URL/API access is independently blocked. Deep links remain after successful auth when their destination is permitted; otherwise use role landing. Clear role/user-scoped Dashboard data on logout or identity changes.

## 2. Tokens and reusable controls

| Element | Requirement |
|---|---|
| Primary green | #006B3C, header/primary action |
| Secondary green | #0B7A46, links/active/focus accents |
| Pale green | #EAF6EF, selected/success/subtle emphasis |
| Page | #F5F7F6 or existing equivalent; white cards, restrained border/shadow |
| Text | Existing dark charcoal-green, readable contrast; do not use green-on-green text |
| Editable | White surface/neutral border, visible label above |
| Read-only | Existing gray-green/ivory treatment, semantic read-only value rather than misleading disabled input |
| Error | Dark red text/border, field-adjacent message plus accessible summary |
| Warning/success | Amber/green plus explicit text/icon label; do not depend on color |
| Buttons | Text labels, consistent primary/secondary/destructive/busy hierarchy; icon-only controls require accessible name and tooltip |

Use existing typography and spacing utilities; form labels have consistent weight, controls one consistent height, descriptions/results multiline with wrapping. Required asterisk is supplementary to label/error semantics. Busy actions disable repeat activation and expose aria-busy; do not disable unrelated navigation without cause. Keep visible keyboard focus on every control and link.

## 3. Requester Dashboard (/dashboard)

Header: Dashboard, authenticated greeting, updated-as-of time in Asia/Bangkok and Refresh button. Four cards in this order: Open Tickets, Waiting for Me, Recently Updated, Recently Resolved. Each has label, number, unit, accessible drill-down link and plain-language period where relevant. Definitions are BR-28-31; UI never computes counts by downloading Tickets.

Below cards: Recently Updated Tickets and Recently Resolved Tickets, max five each, with View all linking the same snapshot bounds/filters. Show Ticket Number, Summary, status badge and relevant update/resolve time. Each Ticket link opens owned Ticket Detail. Keep My Tickets as the detailed search/filter/pagination screen; Dashboard previews are concise. Add Create Ticket and My Tickets text shortcuts using existing routes.

Explain the seven-calendar-day period as "Today and the previous 6 days (Bangkok time)". Recently Resolved excludes unknown historical resolution dates; use a short help text/description, not invented dates or an alarming error. Empty preview says why there is no matching activity; a zero card remains a usable link to the corresponding empty detailed list.

## 4. Staff/Admin Dashboard (/staff/dashboard)

Same header/as-of/Refresh treatment. Four cards: Unassigned Tickets, My Active Tickets, My Active Actions, High/Urgent Tickets. Label Action/Ticket units explicitly. Show all-eight-status counts with readable status badges and links to scope=all filtered Queue. Do not add optional Admin user counts.

Two short lists: Priority and Recently Updated Tickets (priority severity then updated time) and My Completed Actions (server completion time in the recent window). Max five each, safe Ticket/Action summaries only, plus View all. Ticket items open Staff Detail; Action items open /staff/tickets/:id?tab=actions&actionId=:actionId. Do not imply assignee equals performer.

My Active Actions card expands the My Actions section on the same Dashboard and writes actions=active-assigned into URL. It uses GET /api/staff/actions, 10/20/50 pagination and visible total Actions. The completed preview's View all uses actions=completed-performed&from=...&through=... on that section. Columns/cards: Ticket Number, Action Description, Action status, assignee, performer/completion time when present, and Open Action. Expose a clear section heading and move focus to it after card activation. Page/filter changes remain URL-backed; no independent all-Actions product module is added.

## 5. My Tickets / Staff Queue drill-down

Parse and serialize the filters in api-spec.md; preserve valid earlier filter/search/sort behavior. On filter change reset page=1; Refresh/back/forward reproduce query. Show active filter chips/labels and Clear filters, including hidden date/status-group filters from cards, so users understand a narrowed list. Keep explicit date window from the originating snapshot rather than silently shifting it on navigation.

Requester list gains status/set/date filters and updatedAt/resolvedAt sorting needed for cards; priority continues to mean Requested Priority. Staff High/Urgent uses IT Priority. Reject invalid URLs with actionable query feedback and a reset action; do not silently return an unrelated default result. Distinguish an initially empty account/queue from a filter producing no results.

## 6. Ticket Detail - Actions Taken tab

Add a keyboard-accessible Actions Taken tab alongside the existing detail content; preserve all existing Ticket fields, ownership/priority/status tools, communications and attachments. Show count, current work cycle and read-only explanation where appropriate. Implement semantic tablist/tab/tabpanel relationships, arrow/Home/End navigation, aria-selected, focused-tab management and a non-hidden accessible panel. On entry with tab=actions&actionId, load the specific authorized Action even if it is on another list page, expand/focus its heading, and keep list navigation intact.

### List/view mode

All roles see all permitted current representations, including Planned/Cancelled and earlier cycles, ordered createdAt ASC,id ASC. Desktop table: cycle, action occurrence time, Description, status, assignee, performed by, follow-up indicator and permitted View/Edit actions. Details expand to Result, Follow-up Note, Attachment Notes, created-by/time, completion/cancellation identity/time/reason. Wrap long text/file names; abbreviate in rows only if full content is keyboard-accessible in detail.

Mobile cards show the same information in a logical reading order without a horizontally scrolling page. performedBy=null displays "Not completed"; never show creator/assignee under that label. Clearly label user-entered Action Date/Time versus server Created At and Completed At. Earlier-cycle badge says historical/read-only. No destructive Delete control.

### Create mode

Staff/Admin New Action opens an inline form and focuses Description. Fields:

| Field | Behavior |
|---|---|
| Action Description | Required textarea, max 2000 |
| Action Date/Time | Default current server-derived time, display/input Bangkok; convert to offset ISO/UTC for API; no future or pre-Ticket dates |
| Assignee | Required select, defaults current user; populated from existing active staff directory |
| Result | Optional textarea while Planned; max 2000 |
| Follow-Up Required? | Labelled checkbox, false initially |
| Follow-up Note | Textarea max 2000, required when checked; preserve optional context when unchecked |
| Attachment Notes | Optional text max 1000, explain reference to Ticket Attachments |
| Created by / Performed by / status | Server/read-only; creation status Planned, performer Not completed |

Save creates Planned Action, shows success, refreshes Ticket version/summary/list and focuses the new Action heading. Cancel closes the draft; ask before discarding nonempty changed values. No automatic Completed creation bypass.

### Edit/correction mode

Inline form reuses fields and captured expected Ticket/Action versions. Unfinished Actions allow reassignment. Completed/Cancelled allow the descriptive corrections approved in BR-13 but show immutable status/assignee/creator/performer/server timestamps as read-only and require Correction Reason. The API, not disabled fields, enforces this. Save appends revision; cancel returns focus to triggering View/Edit control.

### Start/complete/cancel mode

Show only state-permitted transition actions and explanations. Complete asks for effective Result and Action Date/Time, with follow-up/note controls and displayed current assignee. Performed by states that current authenticated user will be recorded. An inactive assignee requires explicit reassignment before Start/Complete; preserve their historical label and show why. Cancel requires reason and confirms the intended Action, not the whole Ticket.

### Audit mode

Staff/Admin can expand paginated revision history, sequence ascending, showing actor/server time/operation/reason and changed before/after fields. Use readable change labels; do not dump raw JSON into the product UI. Requester has no audit controls and direct API denial is tested. All roles may see the separate public Ticket status timeline. BASELINE displays "Status recorded at Lab 4 migration; original transition time unknown"; never label it "Resolved at".

### Read-only situations

Resolved parent: explain "Reopen this Ticket to add or correct work." Final parent: explain Closed/Cancelled is read-only. Earlier cycle: explain historical work cannot be changed in the new cycle. Keep content/history readable to authorized users. Hide write controls or render explanatory disabled controls consistently; backend remains authority.

## 7. Ticket workflow feedback

Preserve existing Owner/priority/status controls and confirmations. Server allowedTransitions determines available options; show why resolution is blocked (Owner missing, no Completed Action, unfinished work, follow-up outstanding). List blocker counts with a route/tab action to inspect work. A Requester indication is displayed as advisory and is never a Resolved badge.

Waiting requires the existing public explanation field. Ticket cancellation requires a reason and explicitly explains unfinished Actions will be cancelled together. Reopen explains a fresh work cycle and retained locked history. After success update status badges, cycle, resolution timestamp/indication, available transitions, versions and affected Action lists. On rejected gate or conflict retain the form and show the server's safe explanation.

## 8. Common feedback and failure states

| State | Required behavior |
|---|---|
| Initial/loading | Labelled progress/skeleton region, no fake zero data; aria-busy; avoid layout jump |
| Saving | Disable repeated intent, visible busy text, preserve draft and one idempotency key/body |
| Success | Text confirmation in polite live region; refresh dependent data and retain sensible focus |
| Empty/no-results | Distinct explanation and permitted next action; valid zero is not an error |
| Validation | Field-adjacent errors tied with aria-describedby/aria-invalid; focus error summary/first invalid field |
| Forbidden | Safe role/permission explanation, no private fields flashed; link to permitted landing |
| Not found | Same safe Requester page for missing/other-owner resource |
| Stale 409 | Preserve local draft; offer Reload latest for comparison/review; never silently replace expected versions and submit |
| Network/500 | Safe retry guidance; keep form values; ambiguous create/transition retry uses the same key/body |
| Failed refresh | Keep previous data only if clearly labelled stale/as-of; Retry; never display success zeros |
| Session expiry | Clear private cached responses and use auth flow; do not persist Action drafts in shared localStorage |

Any explicit edit after a failed/validated attempt generates a new logical request key; exact retries after unknown network outcome retain the key. Treat cancellation of an in-flight browser request as an unknown server outcome, not proof it failed. Keep draft memory scoped to the current identity/page and clear on logout.

## 9. Responsive and accessibility acceptance

- Desktop >=992px: centered sensible max-width, multi-column forms/cards and tables; test 1440x900.
- Tablet 768-991px: two columns where useful, readable description/result space; test 820x1024.
- Mobile <768px: vertical fields/cards, touch-friendly actions, no horizontal page scrolling; test 390x844.
- No clipped labels/messages, overlapping controls, hidden submit actions, unreadable attachment names or missing states at any size.
- Use semantic headings/landmarks/table headers, real buttons/links, labelled checkboxes/date inputs and accessible tabs. Preserve visible focus, logical Tab order, escape/cancel and return focus for inherited dialogs.
- Status/priority/follow-up use text and optional icons in addition to color. Link/card names include metric context, not repeated unexplained "View" labels. Loading/success/error announcements must not steal focus unnecessarily.
- Long text must wrap; cards/table variants must not announce duplicate hidden content to assistive technology. Keep actions usable at increased text size.

## 10. Visual checklist and artifacts

Use screenshots under artifacts/lab-04/screenshots/staff-dashboard/, requester-dashboard/, actions-taken/. Each major screen gets desktop/tablet/mobile captures with deterministic seeded data and visible role identity. Actions folder also covers workflow gate, current/earlier cycles, create/edit/correction, complete/cancel and read-only states. Additional state captures may be taken at one representative size; core three-size coverage is mandatory.

| Check | Evidence | Status |
|---|---|---|
| Tokens/header/nav/buttons and coherent application shell | Role dashboards + Ticket Detail, three sizes | Planned |
| Metrics/units/date text/drill-down/zero states | Dashboard captures + API/query comparison | Planned |
| Editable/read-only/required/validation/busy controls | Action create/edit/correction and workflow gate | Planned |
| Keyboard/tab/focus/labels/non-color cues | Recorded manual keyboard steps + UI/E2E assertions | Planned |
| Wrapping/clipping/overlap/page overflow | Three viewport screenshots and geometry checks | Planned |
| Forbidden/conflict/API-failure and preserved values | Component/E2E state evidence | Planned |
| Earlier Requester/Staff/Admin screens retain consistency | Representative Lab 3 regression captures | Planned |

Compare rendered screens to this document and approved handout illustrations, not memory. Record actual screenshot paths and reviewer initials only after inspection. Do not mark a checklist row complete because a component test merely passed.
