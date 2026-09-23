# Lab 3 — AI Use and Reflection

**Source:** `D:/Software Engineering/lab3_ai_use_staging.md` (outside the repository)

This is a complete chronological, concise-but-continuous summary of the staging record. Every recorded prompt from P-01 through P-62 is listed separately; short confirmations are retained as separate prompts. Executor, Advisor, and orchestrator work is summarized below by Issue as implementation/review/fix/re-review/PR milestones. This is a summary record, not a verbatim transcript.

## Complete chronological prompt record

### P-01 — Read the codebase and Lab 1–2 requirements

**Prompt:** Inspect the web app and understand the business requirements from Lab 1 through Lab 2.

**Outcome:** Lab 2 became the compatibility baseline; existing Requester tickets, attachments, tests, and behavior must be preserved.

### P-02 — Summarize Lab 3

**Prompt:** Summarize what Lab 3 needs to do.

**Outcome:** The work was divided into authentication, authorization, Staff Queue/Detail, communications, Resolution Indication, User Management, tests, screenshots, documentation, and Git/Kanban evidence.

### P-03 — Plan Lab 3 and create Issues

**Prompt:** Grill the requirements, split the work into tasks, and create GitHub Issues so each can have its own PR and Kanban history.

**Outcome:** Ambiguities were interviewed and resolved; an ordered 18-Issue roadmap with one Issue/one PR traceability was established.

### P-04 — Ask whether JWT is allowed

**Prompt:** “ใช้ JWT ได้ไหม”

**Outcome:** JWT was accepted as a signed token in an HttpOnly cookie backed by a database AuthSession, allowing immediate revocation.

### P-05 — Confirm the revocable JWT direction

**Prompt:** “ได้ครับ”

**Outcome:** Authentication must check the server-side session and reject missing, expired, or revoked sessions even when the JWT signature is valid.

### P-06 — Clarify JWT and session behavior

**Prompt:** “ยังไงนะ”

**Outcome:** JWT proves token integrity and identity claims; AuthSession controls lifecycle and revocation. JWT expiry alone is insufficient for deactivation and password-reset invalidation.

### P-07 — Confirm HttpOnly transport

**Prompt:** “ได้ครับ”

**Outcome:** The JWT is transported in an HttpOnly cookie, not local storage or application-visible JavaScript.

### P-08 — Confirm session lifetime and concurrency

**Prompt:** “ใช่”

**Outcome:** Multiple sessions are allowed for eight hours, with no refresh token, sliding expiry, or remember-me option; normal logout revokes only the current session and high-impact changes revoke all.

### P-09 — Ask about bcrypt versus a database hash

**Prompt:** Explain the difference between storing a bcrypt password and storing a hash in the database.

**Outcome:** Bcrypt is the password-hashing algorithm; only its salted, cost-bearing output is stored. Fast general hashes such as SHA-256 are not appropriate for password storage.

### P-10 — Confirm bcrypt settings

**Prompt:** “ใช่”

**Outcome:** Bcrypt cost 12 is required, with no plaintext password storage or logging.

### P-11 — Confirm password rules

**Prompt:** “ใช่”

**Outcome:** Passwords are 10–72 characters with at least one letter and one digit; uppercase and special characters are optional, and confirmation is required when entering a password twice.

### P-12 — Confirm password reuse and sessions

**Prompt:** “ใช่”

**Outcome:** A changed password cannot equal the current or temporary password; all previous sessions are revoked and the current device receives a fresh session.

### P-13 — Confirm the Role model

**Prompt:** “ใช่”

**Outcome:** Each User has exactly one Role; Administrator inherits Staff Ticket permissions and also receives User Management permissions.

### P-14 — Challenge reopening a long-closed Ticket

**Prompt:** If the same problem returns a week after closing a Ticket, should it be reopened or should a new Ticket be created?

**Outcome:** Closed and Cancelled are final historical states; recurrence creates a new Ticket. Only Resolved may move to Reopened.

### P-15 — Ask what Waiting for Requester means

**Prompt:** “Waiting for Requester คือไร”

**Outcome:** It means IT is waiting for information, confirmation, action, or availability from the Requester; it is not Resolved or complete.

### P-16 — Confirm Waiting-for-Requester behavior

**Prompt:** “ใช่”

**Outcome:** Entering Waiting for Requester must explain what the Requester needs to provide or do.

### P-17 — Confirm atomic status/comment behavior

**Prompt:** “ใช่”

**Outcome:** The status transition and required Public Comment are one transaction; neither may persist alone.

### P-18 — Ask what a dialog is

**Prompt:** “dialog คือยังไง”

**Outcome:** A dialog is a focused confirmation window with consequence text, confirm/cancel controls, focus trapping, safe close behavior, and focus restoration.

### P-19 — Confirm status transitions needing confirmation

**Prompt:** “ใช่”

**Outcome:** Resolved, Closed, Cancelled, and Reopened require confirmation dialogs.

### P-20 — Confirm final-state explanation

**Prompt:** “ใช่”

**Outcome:** The Closed confirmation must state that Closed is final and a recurring problem requires a new Ticket.

### P-21 — Confirm Resolution Indication semantics

**Prompt:** “ใช่”

**Outcome:** “Problem Appears Resolved” is a backend timestamp/indication, not a status transition; only the owning Requester may set it and duplicate active indications are rejected.

### P-22 — Confirm indication lifecycle and priority display

**Prompt:** “ใช่”

**Outcome:** Reopened clears the indication; the Requester can view IT Priority read-only beside Requested Priority.

### P-23 — Clarify Ticket ownership

**Prompt:** “คือยังไง”

**Outcome:** A Ticket may start unassigned; Staff/Admin can Claim an unassigned Ticket or Reassign an owned Ticket, while ownership and status remain separate.

### P-24 — Confirm unassigned creation

**Prompt:** “ใช่”

**Outcome:** Newly created Tickets may remain unassigned.

### P-25 — Confirm Owner requirement

**Prompt:** “ใช่”

**Outcome:** Every status transition requires an active Staff/Admin Owner first.

### P-26 — Confirm independent Claim/Reassign actions

**Prompt:** “ใช่”

**Outcome:** Claim and Reassign never change Ticket status automatically.

### P-27 — Confirm concurrency and unassign policy

**Prompt:** “ใช่”

**Outcome:** Claim is first-writer-wins; a concurrent loser receives 409 Conflict. Lab 3 provides no Unassign operation after ownership exists.

### P-28 — Confirm Staff Queue behavior

**Prompt:** “ใช่”

**Outcome:** The Queue uses server-side Search, filters, stable sorting/tie-breaking, Active/All scope, and one-based pagination.

### P-29 — Clarify the Staff deactivation scenario

**Prompt:** Confirm whether deactivating a Staff Owner means deactivating the Staff User account when it owns 15 unfinished Tickets.

**Outcome:** Yes. The rule protects non-final Tickets from being left with an inactive Owner.

### P-30 — Confirm unsafe deactivation/demotion blocking

**Prompt:** “ใช่”

**Outcome:** Admin cannot deactivate or demote a Staff/Admin who owns non-final Tickets; the API returns a safe 409 with the affected count and requires reassignment.

### P-31 — Clarify historical ownership

**Prompt:** “คือยังไง”

**Outcome:** Non-final Tickets need an eligible active Owner, but Closed/Cancelled Tickets retain their old Owner for historical display.

### P-32 — Confirm final-Ticket historical ownership

**Prompt:** “ใช่”

**Outcome:** Closed/Cancelled Tickets keep historical ownership even after the User is inactive or changes Role.

### P-33 — Confirm immediate session invalidation

**Prompt:** “ใช่”

**Outcome:** Role changes and deactivation revoke all affected sessions immediately; authorization remains database-authoritative.

### P-34 — Ask whether email can contain uppercase letters

**Prompt:** Can email addresses normally contain uppercase letters?

**Outcome:** Account email handling is case-insensitive: trim and lowercase the entire address before lookup and uniqueness checks.

### P-35 — Confirm email normalization

**Prompt:** “ใช่”

**Outcome:** Use trim/lowercase normalization, maximum length 254, basic format validation, and case-insensitive uniqueness.

### P-36 — Confirm User Management list scope

**Prompt:** “ใช่”

**Outcome:** One screen lists active/inactive Users with server-side name/email Search, one optional Role filter, deterministic name/ID ordering, and no pagination for Lab 3.

### P-37 — Confirm initial-password workflow

**Prompt:** “ใช่”

**Outcome:** Admin enters an Initial Password twice; only its bcrypt hash is stored, and the User must change it at next login. No password email delivery is included.

### P-38 — Confirm seed credential safety

**Prompt:** “ใช่”

**Outcome:** Local demonstration credentials may be documented; the seed is idempotent and never overwrites an existing password hash.

### P-39 — Confirm login throttling

**Prompt:** “ใช่”

**Outcome:** The local-lab throttle allows five failed attempts per normalized email in 15 minutes, returns 429 thereafter, clears on success, and has no permanent lockout.

### P-40 — Confirm CSRF and cookie controls

**Prompt:** “ใช่”

**Outcome:** Mutations require session-bound X-CSRF-Token; cookies are HttpOnly/SameSite=Lax and Secure outside local development; CORS is strict and credentialed.

### P-41 — Confirm migration strategy

**Prompt:** “ใช่”

**Outcome:** RequesterUser evolves into User while preserving IDs and Ticket/Attachment foreign keys, removing obsolete department data, and adding credentials only where hashes are missing.

### P-42 — Confirm role-aware landing pages

**Prompt:** “ใช่”

**Outcome:** Mandatory password change precedes normal navigation; Requester lands on My Tickets, Staff on Staff Queue, and Administrator on User Management.

### P-43 — Confirm attachment permissions

**Prompt:** “ใช่”

**Outcome:** Staff/Admin can view attachment metadata and download active files but cannot upload or remove them; Requester retains Lab 2 attachment behavior.

### P-44 — Confirm append-only communication and terminal behavior

**Prompt:** “ใช่”

**Outcome:** Public Comments and Internal Notes are append-only, trimmed plain text of 1–2,000 characters with backend author/time. Closed/Cancelled Tickets reject new communication, attachments, and indications.

### P-45 — Confirm excluded scope and UI shape

**Prompt:** “ใช่”

**Outcome:** No workflow audit history is included. Staff Queue uses a seven-column desktop table and responsive cards; Staff Detail actions are independent; User Management uses Create/Edit/Reset dialogs.

### P-46 — Ask whether GitHub CLI exists

**Prompt:** “มี github cli อยู่ไม่ใช่หรอ”

**Outcome:** The environment was checked for the executable and authentication instead of assuming availability.

### P-47 — Investigate Claude’s GitHub CLI capability

**Prompt:** Claude could inspect GitHub through CLI; investigate how.

**Outcome:** Repository read access, connector permissions, local CLI availability, and authentication were separated. The connector could not create Issues because its token returned 403.

### P-48 — Prefer the GitHub API

**Prompt:** “ผมว่าใช้ผ่าน api github”

**Outcome:** API creation was attempted, but write permissions were insufficient; authenticated `gh api` became the authorized write path.

### P-49 — Confirm creating real GitHub Issues

**Prompt:** “ใช่”

**Outcome:** The roadmap was materialized as Issues in `FramePongrit/toktickit`, not kept only as a local plan.

### P-50 — Confirm one Issue per PR

**Prompt:** “ใช่ี”

**Outcome:** Each Issue gets its own branch and PR into `lab3-staging), with its own relevant tests.

### P-51 — Confirm Kanban lifecycle

**Prompt:** “ใช่”

**Outcome:** The agreed board flow is Backlog → Specified → Started → PR Review → Fixing → Done.

### P-52 — Ask what the engineering contract is

**Prompt:** Is “Sprint 3 engineering contract” specification work?

**Outcome:** Yes. It is the pre-implementation source of truth: specification, API/UI specs, tests, domain context, and ADRs, not production feature code.

### P-53 — Confirm engineering-contract scope

**Prompt:** “ใช่”

**Outcome:** Issue #46 contains contract documents and traceability only; migrations and feature implementation are excluded.

### P-54 — Confirm the ordered roadmap

**Prompt:** “ใช่”

**Outcome:** The 18-item dependency-aware roadmap covers contract, data, auth, authorization, Requester regression, communications, Staff/Admin features, E2E/evidence, final review, and release integration.

### P-55 — Ask whether Issues precede implementation

**Prompt:** Are Issues created before implementation?

**Outcome:** Yes: create/specify Issue → branch from `lab3-staging` → implement with tests → review/fix → Draft PR → human merge → close Issue and update Kanban.

### P-56 — Confirm Issue-first development

**Prompt:** “ใช่”

**Outcome:** No Lab 3 implementation begins before its Issue and acceptance criteria exist.

### P-57 — Ask whether Codex can create PRs

**Prompt:** Claude can create PRs; can Codex do it?

**Outcome:** With authorized GitHub CLI, Codex can implement, commit/push, and open a Draft PR while the user and peer reviewer retain review and merge control.

### P-58 — Explicitly request GitHub CLI PR creation

**Prompt:** Use GitHub CLI to open PRs so the user and reviewer can inspect them.

**Outcome:** GitHub CLI was selected for Issues, Project updates, and Draft PR creation; human approval remains required.

### P-59 — Authorize CLI installation

**Prompt:** “ติดตั้งเลย”

**Outcome:** Official portable GitHub CLI v2.100.0 was downloaded, checksum-verified, installed under ignored `.tools/`, and added to `.gitignore`.

### P-60 — Confirm GitHub authorization

**Prompt:** “อนุมัติแล้ว”

**Outcome:** Authentication as `FramePongrit` was verified; Issues #46–#63 were created and placed in the TokTickIT Individual Sprints Project as Backlog items.

### P-61 — Request an external staging log

**Prompt:** Create `lab3_ai_use_staging.md` outside the repository with prompt-by-prompt conversation summaries.

**Outcome:** The external staging log was created at `D:/Software Engineering/lab3_ai_use_staging.md` and used as the source for this document.

### P-62 — Start implementation with Executor/Advisor reports

**Prompt:** Start work and record Executor reports and Advisor checks in `lab3_ai_use_staging.md`.

**Outcome:** Issue #46 started the repeatable orchestration: implementation, scoped commit, Standards+Spec review, targeted fixes, re-review, verification, Draft PR, human review/merge, and Issue/Kanban closure. The later implementation flow standardized on Luna xhigh Executor and one Terra medium Advisor for both review axes.

## Agent-to-agent implementation and review milestones

### Issue #46 — Engineering contract; PR #64

Terra first produced the contract documents. Sol found eight findings covering CSRF reload recovery, conflict metadata, final-Ticket read/write rules, exact traceability, requester responsive evidence, required summaries, queue tie-breaking, and roadmap numbering. Terra corrected them through several focused passes; the orchestrator independently checked traceability and staged only Issue #46 paths. Standards and Spec eventually passed, then Draft PR #64 was opened and later merged.

### Issue #47 — Data migration and seed; PR #65

Luna implemented the User migration, AuthSession/workflow schema, seed, bcrypt backfill, and migration tests. Terra found requester-only Lab 2 continuity, TicketCounter collision, real-upgrade-test, fresh-seed, account-distribution, repeat-seed, and Attachment-metadata gaps. Docker-backed isolated migration checks were added; Luna fixed each finding, Terra re-reviewed to PASS, the server/migration suites passed, and Draft PR #65 was opened and later merged.

### Issue #48 — Authentication security foundation; PR #66

Luna implemented bcrypt, JWT/AuthSession, cookies, CSRF, CORS, throttling, strict configuration, and security tests. Terra found insecure startup fallback, broad session types, missing request-boundary JWT cases, password-reuse/CSRF lifecycle gaps, and undocumented `.env` loading. Luna corrected the implementation and test harness, Terra re-reviewed Standards and Spec to PASS, and Draft PR #66 was opened and later merged.

### Issue #49 — Authentication and password REST APIs; PR #67

Luna implemented login, current-user, logout, password-change, mandatory-password, session, legacy-route, and migration coverage. Terra found legacy CSRF-session compatibility, mandatory-password/header bypass, wrong API-A03 fixture, missing logout-CSRF coverage, and migration-scope edge cases. Luna added safe legacy-session handling and regressions; final auth, migration, full-suite, build, and Prisma checks passed, Terra returned PASS, and Draft PR #67 was opened and later merged.

### Issue #50 — Authenticated client shell; PR #68

Luna implemented AuthContext, CSRF-aware client requests, Login/Change Password, restoration states, role guards/landings, Logout, and responsive/accessibility behavior. Terra found mobile heading focus, busy-state semantics, mandatory-password routing, and desktop navbar breakpoint gaps. Luna fixed and tested them; targeted 24/24 tests and builds passed, Terra returned PASS, and Draft PR #68 was opened and later merged.

### Issue #51 — Server authorization and ownership guards; PR #69

Luna implemented live identity/Role/session guards, Administrator hierarchy, safe error precedence, Requester ownership protection, and parser/error handling. Terra found fragile requester guard behavior, attachment/finalization race coverage, and missing expired-JWT evidence. Luna changed the guard, added parent-row locking and loser cleanup, added API-Z01, Terra re-reviewed to PASS, and Draft PR #69 was opened and later merged.

### Issue #52 — Authenticated Requester regression; PR #70

Luna removed the development Requester selector/header/storage path and migrated Lab 2 flows to authenticated cookie+CSRF sessions. Terra found stale README/middleware residue and missing detail, priority, attachment, rejection, cleanup, and final-state evidence. Luna corrected documentation and expanded the suites; focused 16/16, server 142/142, and client 90/90 passed, Terra returned PASS, and Draft PR #70 was opened and later merged.

### Issue #53 — Communications and Resolution Indication APIs; PR #71

Luna implemented Public Comments, Internal Notes, and Resolution Indication. Terra first found missing finalization interleaving proof, then rejected a fixed timeout as nondeterministic. Luna added a test-only lock hook, PostgreSQL PID/wait-state observation, and deterministic barriers; 16/16 focused and 158/158 server tests passed, Terra returned Standards and Spec PASS, and Draft PR #71 was opened and later merged.

### Issue #54 — Requester Ticket Detail UI; PR #72

The Executor first stopped during an inspection snapshot, then completed the UI: priorities, comment timeline/composer, Resolution Indication, hidden notes, terminal read-only behavior, and attachment interactions with responsive safeguards. Focused 10 tests and the full client suite passed. The corresponding Draft PR #72 was opened and later merged; the existing Lab 2 docs/screenshots stayed untouched.

### Issue #55 — Staff/Admin communication UI; PR #73

The staging log has no separate expanded Executor/Advisor narrative for this Issue. The repository’s delivery history records the completed Issue #55 work as Draft PR #73, subsequently merged into `lab3-staging`; no unsupported raw report is reconstructed here.

### Issue #56 — Staff Ticket Queue UI; PR #74

The Executor implemented server-driven filters/search/sort/pagination, desktop table, responsive cards, owner-directory states, loading/empty/error/accessibility states, and Queue tests. Advisor review identified pagination overflow, generic skeletons, owner retry/403, boundary, and responsive gaps. The Executor corrected them; focused 10/10, client 116/116, build, and diff checks passed, then Draft PR #74 was opened and later merged.

### Issue #57 — Staff Ticket Detail operations API; PR #75

The Executor implemented detail representation, Claim/Reassign, IT Priority, status transitions, locks, ownership conflicts, Waiting-for-Requester atomic comments, Reopened clearing, and final guards. After pauses, the Advisor-driven corrections added controlled Reassign/deactivation and priority/finalization lock-barrier tests, including the last-active-Administrator interleaving. Focused 17/17 and server 186/186 passed; the work was reviewed and delivered as Draft PR #75, later merged.

### Issue #58 — Staff/Admin Ticket Detail UI; PR #76

The staging log has no separate expanded Executor/Advisor narrative for this Issue. Repository delivery history records the completed Issue #58 work as Draft PR #76, subsequently merged into `lab3-staging`; no raw report is reconstructed.

### Issue #59 — Administrator User Management API; PR #77

Terra’s independent review passed Standards but found two Spec gaps: deterministic concurrent Administrator demotion/deactivation protection and normalized duplicate-email/invalid-PATCH coverage. The implementation/test correction added those cases; the completed work was delivered as Draft PR #77 and later merged.

### Issue #60 — Administrator User Management UI; PR #78

The staging log has no separate expanded Executor/Advisor narrative for this Issue. Repository delivery history records Draft PR #78 as merged into `lab3-staging`; the next E2E/evidence branch was based on that merge.

### Issue #61 — E2E, security, responsive tests, and screenshots; PR #79

The orchestrator started the branch from PR #78 and verified the existing Docker PostgreSQL container without resetting it. Luna added real browser/API journeys, direct authorization checks, isolated migration regression, legacy coverage, responsive diagnostics, and deterministic Lab 3 screenshots. Terra first found missing Queue filter/sort/page assertions, Waiting-for-Requester explanation, Resolution Indication, administration protections, UI logout/direct-route proof, full-run/migration evidence, and responsive diagnostics; Luna fixed them. A final Terra review found only the last-active-Administrator E2E gap; Luna added the deterministic concurrent proof and Terra re-reviewed to PASS. Full bounded verification passed: isolated server 197 tests, client 150 tests, migration 3/3, Lab 3 E2E 6/6, legacy 1/1, screenshots 4/4, and all nine runner steps. Draft PR #79 was opened and later merged.

### Issue #62 — Final evidence documents; PR #80

The Executor prepared reviewer history, AI-use evidence, tests/specification updates, README links, and visual evidence. Terra found two documentation-consistency findings in `tests.md`; the Executor corrected the “future files” wording and clarified that the recorded results were on `lab3-staging` while Issue #63 still owns `main` integration. The re-review passed Standards and Spec, and Draft PR #80 was opened. This file is the requested correction to its AI-use section; it is intentionally uncommitted and unpushed.

## Authorized reflection

Lab 3 taught me to treat the specification, tests, GitHub Issues, pull requests, and Kanban state as one connected engineering record rather than as separate deliverables. At the beginning, many requirements sounded simple but were still ambiguous in implementation terms. The discussion about JWT, session revocation, bcrypt, `Waiting for Requester`, final Ticket states, resolution indication, and Staff ownership helped turn broad requirements into concrete rules, validation conditions, and test cases. For example, deciding that a later recurrence should create a new Ticket instead of reopening a historical closed Ticket affected both the state model and the UI behavior.

The most valuable process decision was to create an Issue before implementing each meaningful part and then keep one branch and one Draft PR per Issue. This made dependencies visible and reduced the risk of mixing unrelated work. It also gave every review a bounded scope: the reviewer could compare one contract to one implementation rather than reviewing a large combined change. The Kanban status then became more than a checklist; it showed what had been specified, implemented, reviewed, merged, and still needed human confirmation.

Using an Executor and a separate Advisor was especially useful. The Executor could focus on implementation and verification, while the Advisor checked both coding standards and whether the result actually fulfilled the original requirement. Several Advisor findings were important because the initial implementation already had passing tests but did not yet prove every acceptance criterion. Examples included deterministic concurrency tests, legacy migration evidence, browser-level authorization checks, responsive behavior, Queue filter/sort/pagination coverage, and the last-active-Administrator protection. This showed me that a passing test count is meaningful only when the tests represent the right behavior.

I also learned to be careful with test isolation and local infrastructure. The E2E work used Docker PostgreSQL, but the final verification had to avoid resetting or mutating the public local schema. The isolated-schema runner made migrations, seed data, browser tests, and cleanup reproducible without damaging existing work. When the runner itself had problems, such as process cleanup and exit-code reporting, those were treated as engineering problems to fix rather than being hidden behind a manual result. This made the final evidence more trustworthy.

The final E2E pass reinforced that automated totals are not the whole submission. The integrated run passed the server, client, migration, browser, legacy, and screenshot checks, but the screenshots still needed visual inspection against Zen Green styling, responsive layouts, readable tables, dialog behavior, and accessibility expectations. Documentation also needed to distinguish verified facts from placeholders: reviewer approval and merge history should be recorded only after they happen, not implied by an automated review.

Overall, Lab 3 gave me more practice in connecting requirements to implementation, tests, review feedback, and delivery evidence. I now see the value of documenting why a rule exists, not just how it was coded. The completed Issue and PR history makes it possible to trace a feature from an early question through the engineering contract, automated verification, review findings, corrections, and final merge. I will keep the Issue #62 reviewer and Kanban fields explicit so the final submission records the human review honestly rather than suggesting that AI-assisted implementation or automated checks replaced it.
