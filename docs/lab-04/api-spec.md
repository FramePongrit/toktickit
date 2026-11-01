# Lab 4 REST API Contract

Status: stakeholder-approved design, authored 2026-10-23; implementation and verification pending. Authority: [specification](specification.md), especially BR-01 through BR-42. [UI](ui-spec.md) and [tests](tests.md) use this exact contract. Lab 3 routes/capabilities remain except the explicit operational-write extensions below.

## 1. Common transport, authorization and compatibility

Base namespace /api. Existing session cookie, current active-user/role lookup, mandatory password change and X-CSRF-Token protection remain. New state-changing JSON routes require configured-origin credentials and CSRF; GET needs no CSRF. Add Idempotency-Key to the explicitly permitted credentialed CORS request headers; do not broaden origins. Dates are ISO8601 UTC instants with an offset required on input. IDs and versions are positive integers, never client-selected authors/cycles.

Success single-resource routes return the resource object; paginated routes return {data,page,pageSize,total,totalPages}. Empty lists use data=[], total=0,totalPages=0, HTTP 200, even when page exceeds the final page. Query pages start at 1; allowed pageSize is 10/20/50, default 10. Unknown new body/query fields and invalid enums/ranges are 400; do not silently clamp. Preserve existing valid query behavior.

Errors remain {error:{code,message,details?,meta?}}. details maps only documented validation fields. meta contains only authorized conflict/reload/gate information. Never serialize credentials, sessions, hashes, internal SQL or Action history to Requesters. PersonRef = {id,fullName}; operational assignee directory reuses GET /api/staff/ticket-owners returning its existing {id,fullName,role} safe fields.

| Boundary | Result |
|---|---|
| Missing/expired/revoked/orphaned session | 401 UNAUTHENTICATED |
| Authenticated User found inactive | Existing 403 USER_INACTIVE; a session already revoked by deactivation instead fails the preceding 401 session check |
| Mandatory password change | Existing 403 PASSWORD_CHANGE_REQUIRED; preserve exact Lab 3 envelope |
| Wrong role / invalid CSRF | Existing 403 FORBIDDEN / CSRF error contract |
| Requester-owned Ticket absent or belongs to somebody else | Same 404 TICKET_NOT_FOUND |
| Action absent or not under the authorized path Ticket | 404 ACTION_NOT_FOUND; no cross-Ticket lookup leak |
| Internal unexpected failure | 500 INTERNAL_ERROR with safe message |

Requester namespaces require REQUESTER, owned records only; Staff namespaces require STAFF/ADMIN. Admin dashboard uses Staff API. Requesters cannot call Staff APIs even for owned Tickets. Staff/Admin use their own detail/history routes rather than impersonating Requesters. Existing shared Public Comment/attachment-read routes keep Lab 3 role behavior.

### Explicit earlier-route increments

- Staff Ticket detail adds version, workCycle, resolvedAt, serverTime, allowedTransitions and resolutionGate. serverTime is the response's current UTC instant for default Action Date/Time without trusting client clock skew. allowedTransitions omits RESOLVED when the gate fails; resolutionGate reports safe reason codes/counts so the UI can explain it.
- Requester Ticket detail adds workCycle/resolvedAt; Requester list adds updatedAt/resolvedAt fields for new sorts without removing earlier fields.
- PATCH /staff/tickets/:id/claim now accepts {expectedTicketVersion}; /owner adds expectedTicketVersion to {ownerId,expectedOwnerId}; /it-priority adds expectedTicketVersion to {itPriority}; /status additions are in section 5. Missing versions are 400 on otherwise eligible requests. This is an intentional request-contract change requiring coordinated client and Lab 3 test updates, not silent backward compatibility.
- Existing Claim/Owner/Priority success fields remain and add ticketVersion. ExpectedOwnerId conflict semantics remain; TICKET_OWNER_CHANGED with safe owner precedes a generic stale version when both describe a lost Reassign.
- Public Comments, Internal Notes, attachments and Requester resolution indication retain their payloads and lock-based append/atomic guards. They do not require an expected version because they do not replace shared operational fields. Public visible activity advances updatedAt; Internal Notes do not. These operations do not increment the operational Ticket.version. Status-integrated waiting comment/indication clearing belongs to that single versioned transition.
- Ticket.version increments once per successful state-changing Claim/Owner/Priority/status or Action write. Action.version increments once per state-changing Action edit/transition, including Ticket-driven cancellation. A parent cancellation increments Ticket.version once for the whole transaction. Reads, rejected operations, no-ops and replays change neither version nor timestamps.
- /api/health and all earlier auth/reference/User/Requester/communication/attachment APIs remain available as approved. No private revision data is embedded in existing Requester responses.

No-op policy: setting IT Priority to the already-current value with a valid expected version returns 200 with the same value/ticketVersion and no timestamp/history change. Stale expected versions still conflict. Reassign ownerId=expectedOwnerId remains the existing 400 validation failure; changed actual Owner versus expectedOwnerId remains TICKET_OWNER_CHANGED. Claim on an assigned Ticket retains TICKET_ALREADY_ASSIGNED. Same-status Ticket/Action transitions remain invalid edges; unchanged Action PATCH is the explicit 400 in section 3. Thus no-op behavior does not contradict version or recent-activity definitions.

### Guard and transaction precedence

Malformed JSON/transport errors may precede application guards as before. For parsed new writes: authenticate/current-user/mandatory-password/role/CSRF; authorized parent and child existence; validate idempotency header and check an already committed authorized replay; parent final guard; parent Action-read-only/cycle guards where applicable; existing ownership-state prerequisites; validate body and expected version fields; lock/recheck eligible Users, parent and child; check current versions, eligible assignee/Owner, matrix/gate/effective-field validation; persist state/history/idempotency atomically.

For Ticket status, preserve Final then eligible Owner before status/body validation as Lab 3. A replay is checked before mutable-state/old-version rejection, because it returns an earlier authorized result and performs no mutation. Any fresh attempt on a final Ticket is TICKET_FINAL even with invalid business fields. Race losers re-evaluate final/read-only/state guards under locks rather than overwriting. Candidate User locks precede Ticket locks consistently with User administration; retry acquisition if prerequisite identity changed. Never introduce Ticket-then-User inversion.

## 2. Action representation and reads

Staff Action representation (nullable fields abbreviated, not omitted):

~~~json
{
  "id": 21, "ticketId": 42, "workCycle": 1,
  "status": "PLANNED", "description": "Inspect the network connection",
  "result": null, "actionAt": "2026-10-23T04:00:00.000Z",
  "assignee": {"id": 7, "fullName": "Niran Staff"}, "assigneeEligible": true,
  "createdBy": {"id": 9, "fullName": "Kanya Admin"}, "performedBy": null,
  "followUpRequired": false, "followUpNote": null, "attachmentNotes": null,
  "version": 1, "createdAt": "2026-10-23T04:00:00.000Z",
  "updatedAt": "2026-10-23T04:00:00.000Z", "completedAt": null,
  "cancelledAt": null, "cancelledBy": null, "cancelReason": null,
  "permissions": {"canEdit": true, "allowedTransitions": ["IN_PROGRESS","COMPLETED","CANCELLED"]}
}
~~~

Examples are illustrative, not current DB facts. permissions are derived from current parent/cycle/state and user eligibility; the server still rechecks on write. Staff-only assigneeEligible reports current active STAFF/ADMIN eligibility so unfinished work can display a reassignment warning. Requester projection includes business fields and PersonRefs but omits assigneeEligible, version, permissions and revision payloads. A null performedBy means not completed; never substitute assignee or creator for actual performer.

| Method/path | Purpose / success |
|---|---|
| GET /staff/tickets/:id/actions | Staff/Admin all-cycle Action list, page/pageSize only; createdAt ASC,id ASC; 200 paginated Actions plus ticketVersion, workCycle. |
| GET /staff/tickets/:id/actions/:actionId | One Action under this Ticket, 200 Action plus ticketVersion. Used by direct detail links even when record is on another list page. |
| GET /tickets/:id/actions | Requester owned-Ticket all-cycle read-only list; same pagination/order. No revisions or staff controls. |
| GET /staff/tickets/:id/actions/:actionId/history | Staff/Admin only, page/pageSize; sequence ASC; {id,sequence,operation,actor,occurredAt,reason,before,after}. Full snapshots contain Action business fields, never credentials/Internal Notes. |
| GET /staff/tickets/:id/workflow | Staff/Admin public WorkflowEvent list. |
| GET /tickets/:id/workflow | Requester-owned public WorkflowEvent list. |

Workflow lists use page/pageSize, occurredAt ASC,id ASC and {id,kind,fromStatus,toStatus,workCycle,actor,occurredAt,reason,publicCommentId}. BASELINE has fromStatus=null, actor=null and the optional `label` field set to `Lab 4 migration snapshot; original transition time unknown`; other kinds omit label. CREATED is the original new-Ticket event. These do not assert historical transitions. Public reasons must never be populated from an Internal Note. Final/old-cycle reads remain available to permitted readers. Return this public projection rather than raw database event rows.

## 3. Action create and edit

### POST /staff/tickets/:id/actions

Requires Idempotency-Key and expectedTicketVersion; 201 returns {action:StaffAction,ticketVersion}. Body:

~~~json
{
  "expectedTicketVersion": 3,
  "description": "Inspect the network connection",
  "actionAt": "2026-10-23T04:00:00.000Z",
  "assigneeId": 7,
  "result": null,
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": "See router-photo.png"
}
~~~

description required; assigneeId omitted defaults to caller; actionAt omitted defaults to server now; followUpRequired omitted defaults false; optional text omitted/null/trimmed-empty becomes null. Result may be saved before completion. Server sets PLANNED, current cycle, creator, versions and timestamps and inserts CREATE revision. Reject client status/performer/creator/cycle/id/server-time fields. Parent must be in ACTIVE; a Ticket Owner is not required to record an Action, but is required later for a Ticket transition.

### PATCH /staff/tickets/:id/actions/:actionId

Requires expectedTicketVersion and expectedActionVersion. Allow nonempty partial update of description,result,actionAt,followUpRequired,followUpNote,attachmentNotes; assigneeId additionally allowed only for PLANNED/IN_PROGRESS. Optional correctionReason required when current Action is COMPLETED/CANCELLED, not for unfinished edits. Reject a request with no business field or unchanged effective business state, 400 VALIDATION_FAILED (no empty audit entries). Validate the effective merged record: omitting a follow-up note cannot evade an existing true flag; Completed result cannot be cleared.

Terminal Action correction cannot change status, creator, performer, assignee, completion/cancellation timestamps or cancellation identity/reason. Earlier-cycle Actions and Actions on RESOLVED/final Tickets cannot be corrected. 200 returns {action,ticketVersion}; append EDIT revision with before/after and correction reason. Reassignment uses existing safe owner-directory data and checks target eligibility under lock. Editing other fields while an unfinished assignee is inactive is permitted; start/complete remains blocked until reassigned.

All Action texts/dates follow BR-06-09. correctionReason/cancelReason are operational plain text, not rich HTML. Render all stored text escaped. No delete route.

## 4. Action transitions

### POST /staff/tickets/:id/actions/:actionId/transitions

Requires Idempotency-Key; body always contains expectedTicketVersion,expectedActionVersion,status. Status destinations are IN_PROGRESS/COMPLETED/CANCELLED. Reject absent matrix edges with 409 INVALID_ACTION_TRANSITION.

- IN_PROGRESS: no additional fields; current assignee must be active STAFF/ADMIN.
- COMPLETED: optionally supply result,actionAt,followUpRequired,followUpNote to complete effective saved values atomically. Require nonempty effective Result and valid occurrence time; eligible current assignee. Server sets performedBy=caller and completedAt=now. False follow-up does not imply Result success; it only states no outstanding follow-up for this Action.
- CANCELLED: require cancelReason; no completion fields; no active-assignee prerequisite. Server sets cancelledBy/cancelledAt. A Completed Action cannot transition to this state.

Any field specific to a different destination is 400. 200 returns {action,ticketVersion}. One TRANSITION revision with authenticated actor and effective before/after. No intermediate update is committed if validation/transaction fails.

## 5. Ticket status increment

### PATCH /staff/tickets/:id/status

Preserves route/method and Lab 3 matrix. Requires Idempotency-Key and body {expectedTicketVersion,status,publicComment?,cancelReason?}.

- WAITING_FOR_REQUESTER requires publicComment, trimmed 1-2000; no cancelReason. It creates one Public Comment and one workflow event with one status/version change atomically.
- CANCELLED requires cancelReason, trimmed 1-1000; no publicComment. Atomically cancel all unfinished current-cycle Actions, append their TICKET_CANCEL revisions, and one Ticket event. User/Action/history failures roll back parent and all children.
- Other destinations reject publicComment/cancelReason. RESOLVED evaluates BR-18 under the same transaction; sets resolvedAt=now. REOPENED increments workCycle and clears resolvedAt/indication once. CLOSED retains resolvedAt (including null legacy unknown).
- ResolutionGate = {canResolve,reasons,completedCount,unfinishedCount,followUpCount}. Reasons are NO_COMPLETED_ACTION, UNFINISHED_ACTIONS, FOLLOW_UP_REQUIRED, OWNER_REQUIRED as applicable; counts concern current cycle only. 409 RESOLUTION_GATE_FAILED returns authorized meta.resolutionGate and writes nothing. An unknown/absent matrix edge is not a gate failure.

200 adds to preserved response fields: {currentStatus,resolutionIndication,allowedTransitions,ticketVersion,workCycle,resolvedAt,resolutionGate}. One public TRANSITION event per successful actual change; fromStatus != toStatus and event.workCycle equals the resulting Ticket.workCycle, including the new cycle on REOPENED. Existing legacy RESOLVED may CLOSE without needing an Action because that does not enter RESOLVED anew. A Reopened legacy Ticket must meet new-cycle gate before its next resolution.

## 6. Idempotency and conflicts

Idempotency-Key is an opaque UUID v4 string generated once per user intent. Scope is current user id + uppercase method + canonical resource path + key. SHA-256 of canonical client-supplied JSON after deterministic syntactic normalization (including supplied expected versions) distinguishes payloads; calculate it before injecting server-time defaults, generated ids or current saved-state values. Keep omitted optional fields distinct from explicit values. Thus an exact retry with omitted actionAt still replays, rather than hashing a new server-now default. The client retries the exact body and key after ambiguous network failure. JSON property ordering is irrelevant; changed supplied values/versions are different payloads. On validation failure no success record is stored; after correcting a form the client generates a new key.

Serialize the full request scope before mutable-state/version checks: within the effect transaction acquire a PostgreSQL transaction-scoped advisory lock derived from the full user/method/path/key scope, then re-read the committed IdempotencyRecord. Only after that lookup misses may the request acquire domain locks, evaluate current mutable guards/versions/defaults and execute. The second concurrent identical request waits at this scope lock and then finds/replays the winner's success, rather than returning a stale-version conflict after waiting on the Ticket. Keep the full unique database scope as the identity; a hash collision only serializes unrelated requests and never makes their records equivalent. Use READ COMMITTED for this write transaction so the lookup after waiting sees the committed result. The advisory lock precedes User/Ticket/Action locks; use the existing deterministic User-before-Ticket order for subsequent domain locks.

Persist the success record, effect and history in the same transaction. If the winner rolls back, no success record/effect survives and the next request may execute. Record successes only. Different body under a successful key => 409 IDEMPOTENCY_KEY_REUSED. Successful replay sets Idempotency-Replayed:true and does not refresh timestamps or increment versions. Re-authorize current actor/role/resource before replay, so deactivation/logout/role change cannot use cached results. No automatic expiry feature is added for the lab.

| Status/code | Meaning / safe metadata |
|---|---|
| 400 VALIDATION_FAILED | Required version/key/field/query malformed or missing; field details where safe. |
| 409 TICKET_FINAL | Closed/Cancelled rejects every fresh mutation before business validation. |
| 409 TICKET_ACTIONS_READ_ONLY | Actions cannot change while parent RESOLVED. |
| 409 ACTION_CYCLE_READ_ONLY | Action belongs to an earlier work cycle. |
| 409 STALE_TICKET_VERSION | meta.currentVersion and reload target; no private snapshot. |
| 409 STALE_ACTION_VERSION | meta.currentVersion and reload target. |
| 409 ACTION_CHANGED_RETRY | Assignee identity kept changing during ordered lock acquisition; reload and retry. No mutation or private User details. |
| 409 ASSIGNEE_NOT_ELIGIBLE | Absent/inactive/non-operational target indistinguishable; no User details. |
| 409 INVALID_ACTION_TRANSITION | Destination not allowed from present Action state. |
| 409 RESOLUTION_GATE_FAILED | Current-cycle gate unmet; authorized meta.resolutionGate only. |
| 409 IDEMPOTENCY_KEY_REUSED | Successful key reused for different data. |
| Earlier 409 codes | Preserve Ticket ownership/matrix/Requester indication/Admin safety codes as documented in Lab 3. |

For Action writes, Ticket stale check precedes Action stale check when both are stale. UI reloads parent plus Action before reviewing a draft. Never auto-resubmit that draft with fresh versions without an explicit user action.

## 7. Dashboards

### GET /requester/dashboard and GET /staff/dashboard

No query parameters. Server chooses one asOf and a repeatable-read snapshot for all counts/previews; public calculation rules are BR-28-37. Return 200:

~~~json
{
  "generatedAt": "2026-10-23T04:00:00.000Z",
  "window": {"timeZone":"Asia/Bangkok","from":"2026-10-16T17:00:00.000Z","through":"2026-10-23T04:00:00.000Z"},
  "metrics": {
    "openTickets": {"value":3,"unit":"tickets","href":"/tickets?statuses=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED"},
    "waitingForMe": {"value":1,"unit":"tickets","href":"/tickets?status=WAITING_FOR_REQUESTER"}
  },
  "previews": {}
}
~~~

The shown window covers Bangkok October 17-23. Actual payload contains all metrics/previews below; paths are relative internal allowlisted paths, never arbitrary redirects. href strings must URL-encode timestamps/values in implementation. This example is abbreviated and not a claim of live counts.

| Response | Required fields and maximum preview sizes |
|---|---|
| Requester metrics | openTickets, waitingForMe, recentlyUpdated, recentlyResolved; all unit=tickets. |
| Requester previews | recentUpdated and recentResolved: {data:[TicketSummary <=5],href}. Summary contains id,ticketNumber,summary,currentStatus,itPriority,updatedAt,resolvedAt; no other Requester's data. |
| Staff metrics | unassignedTickets,myActiveTickets,myActiveActions,highUrgentTickets. First/second/fourth unit=tickets; myActiveActions unit=actions. |
| Staff statusCounts | Object with all eight status enum keys, each mapping to {value,unit:"tickets",href}; value is a nonnegative integer for all Tickets visible to Staff/Admin. Sum of values equals all Ticket count in snapshot. Each href uses matching scope=all and status. |
| Staff previews | priorityRecentTickets (<=5) and myCompletedActions (<=5), each {data,href}. Ticket summary adds safe requester and Owner as existing queue rows. Action summary includes id,ticketId,ticketNumber,description,status,assignee,performedBy,completedAt; no entire Ticket/comments/revisions. |

All metric objects contain value/unit/href. Empty data is 200 with zeros/empty arrays, never 404. Forbidden/session/API failures are errors, not all-zero successful dashboards. Admin uses staff payload without user-count cards. Read-only metrics have no side effects. Responses are private/no-store; client cache is user-scoped and cleared on logout/role change.

### Matching Ticket list filter increments

Retain earlier single status/itPriority filters. Add optional comma-separated statuses (distinct valid Ticket statuses, max eight), itPriorities (distinct valid priorities, max four; Staff only), updatedFrom,updatedThrough,resolvedFrom,resolvedThrough (offset ISO instants), and Requester sort=updatedAt|resolvedAt in addition to earlier sorts. Do not accept both status and statuses, or itPriority and itPriorities. Supplied date bounds are inclusive; lower <= upper, no inferred date truncation. Date comparisons exclude null resolvedAt. New Requester filters accept status/statuses. Existing requested-priority filter remains requestedPriority, never silently changes meaning.

Existing filters AND together; OR applies only inside a supplied set. Staff scope remains active by default, so resolved/status breakdown drill-down must explicitly use scope=all. New date sorts use nulls last and id DESC when descending/id ASC when ascending; existing sort/tie rules stay unchanged. Priority/recent Staff preview drill-down uses sort=priorityRecent (new fixed order itPriority DESC,updatedAt DESC,id DESC), not the existing default priority tie rule. New Requester updatedAt/resolvedAt sorts default desc; older defaults remain.

| Metric/list | Required detailed URL predicate |
|---|---|
| Requester Open | /tickets?statuses=ACTIVE expanded to five enums |
| Waiting | /tickets?status=WAITING_FOR_REQUESTER |
| Recent updates | /tickets?updatedFrom=window.from&updatedThrough=window.through&sort=updatedAt&order=desc |
| Recent resolutions | /tickets?statuses=RESOLVED,CLOSED&resolvedFrom=window.from&resolvedThrough=window.through&sort=resolvedAt&order=desc |
| Staff unassigned | /staff/tickets?scope=active&owner=unassigned |
| My Tickets | /staff/tickets?scope=active&owner=me |
| High/Urgent | /staff/tickets?scope=active&itPriorities=HIGH,URGENT |
| Status counts | /staff/tickets?scope=all&status=chosenEnum |
| Priority/recent preview | /staff/tickets?scope=active&sort=priorityRecent |
| My Active Actions | /staff/dashboard?actions=active-assigned (expands the paginated Action section) |
| My completed preview | /staff/dashboard?actions=completed-performed&from=window.from&through=window.through |

ACTIVE in this table is notation only; serializers expand the actual enum list. Do not send a literal ACTIVE enum. Filters remain constrained to authenticated ownership/role. New combinations/unknown keys reject with safe 400 field errors. Client URL parsers show invalid-query feedback rather than resetting silently. Window bounds in a link are fixed to the metric snapshot; new Dashboard Refresh yields new bounds. Concurrent changes after navigation may legitimately change totals; do not claim multi-request global snapshot consistency.

### GET /staff/actions

Supports the paginated inline Dashboard section. Query: view=active-assigned (default) or completed-performed, page/pageSize; completed-performed requires from and through ISO instants and validates from<=through; active-assigned rejects date parameters. Actor is always authenticated caller, never arbitrary assigneeId/performerId. Predicate/order: active-assigned uses BR-33 with createdAt ASC,id ASC; completed-performed uses BR-34 with completedAt DESC,id DESC. Response paginates safe Action summaries with parent number/currentStatus/workCycle. Zero matches follow common empty metadata. Each row links /staff/tickets/:ticketId?tab=actions&actionId=:id, fetching that Action directly if outside the current list page.

Concrete ActionSummary representation shared by this list and Staff performed previews: `{id,ticketId,ticketNumber,description,status,workCycle,assignee,performedBy,completedAt,ticket:{currentStatus,workCycle}}`. The outer workCycle belongs to the Action; ticket.workCycle is the current parent cycle, allowing historical performed work to be labelled honestly. Person fields use the common safe PersonRef; performedBy/completedAt remain nullable. Staff Ticket previews retain the common TicketSummary fields, including explicit nullable resolvedAt, and add the existing safe Requester/Owner fields.

## 8. Safety, validation and performance evidence

No endpoint loads complete Ticket collections to compute cards. Use database COUNT/groupBy/limited selects and relation predicates; share predicate definitions between card counts and detailed list filters. Index/query-plan evidence and 1000-Ticket/5000-Action performance fixture are specified in tests.md. Avoid N+1 Ticket/User/revision fetches for previews.

All write paths preserve existing User/parent lock ordering and attachment file cleanup on failure. A status race, cancellation race, assignee deactivation or injected history-write failure must leave one valid committed state, not half an audit. All direct authorization, effective PATCH validation, replay, version and gate cases are required tests, not optional UI checks.
