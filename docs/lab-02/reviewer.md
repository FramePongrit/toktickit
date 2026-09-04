# Lab 2 — Peer Review Record

**Author:** Pongrit Boawan — 67070505204 — GitHub: [@FramePongrit](https://github.com/FramePongrit)
**Peer reviewers:** [Nara Kosiyaporn 67070505218](https://github.com/narakosi-dev), [Nitithorn Ketkaew 67070505203](https://github.com/SANOP19), [Tantiyawat Chansiri 67070505216](https://github.com/Leviathan-c137)

**Repository:** https://github.com/FramePongrit/toktickit
**Integration branch:** `lab2-staging` → released to `main` by one final Pull Request

---

## 1. Pull Requests I authored

Every feature branch reached `lab2-staging` through a reviewed Pull Request, each linked to its Issue through the Development panel on the PR page. A `Closes #n` keyword does not create that link when the PR targets a non-default branch, so the link was made by hand every time.

| Lab issue | Branch | PR | Reviewer | Verdict | Merged |
|---|---|---|---|---|---|
| 5 — Specification and test plan | `feature/5-lab2-spec-docs` | [#14](https://github.com/FramePongrit/toktickit/pull/14) | @Leviathan-c137 | Approved | ✅ |
| 6 — Data model, migrations, seed | `feature/6-data-model-and-seed` | [#16](https://github.com/FramePongrit/toktickit/pull/16) | @Leviathan-c137 | Approved | ✅ |
| 7 — Server architecture, reference APIs | `feature/7-server-architecture-and-reference-apis` | [#18](https://github.com/FramePongrit/toktickit/pull/18) | @narakosi-dev | Approved | ✅ |
| 8 — Create Ticket API | `feature/8-create-ticket-api` | [#20](https://github.com/FramePongrit/toktickit/pull/20) | @narakosi-dev | Approved | ✅ |
| 9 — My Tickets list API | `feature/9-my-tickets-api` | [#22](https://github.com/FramePongrit/toktickit/pull/22) | @SANOP19 | Approved | ✅ |
| 10 — Ticket Detail API | `feature/10-ticket-detail-api` | [#24](https://github.com/FramePongrit/toktickit/pull/24) | @narakosi-dev | Approved | ✅ |
| 11 — Attachments API | `feature/11-attachments-api` | [#26](https://github.com/FramePongrit/toktickit/pull/26) | @narakosi-dev | Approved | ✅ |
| 12 — Client foundation | `feature/12-client-foundation` | [#28](https://github.com/FramePongrit/toktickit/pull/28) | @narakosi-dev | Approved | ✅ |
| 13 — Create Ticket screen | `feature/13-create-ticket-screen` | [#30](https://github.com/FramePongrit/toktickit/pull/30) | @narakosi-dev | Approved | ✅ |
| 14 — My Tickets screen | `feature/14-my-tickets-screen` | [#32](https://github.com/FramePongrit/toktickit/pull/32) | @narakosi-dev | Approved | ✅ |
| 15 — Ticket Detail and attachments | `feature/15-ticket-detail-and-attachments` | [#34](https://github.com/FramePongrit/toktickit/pull/34) | @narakosi-dev | Approved | ✅ |
| 16 — Playwright E2E and screenshots | `feature/16-e2e-and-screenshots` | [#36](https://github.com/FramePongrit/toktickit/pull/36) | @SANOP19 | Approved | ✅ |
| 17 — Visual inspection and documentation | `feature/17-visual-review-and-docs` | | | |
| 18 — Lab 2 release | `lab2-staging` → `main` | | | |

Twelve Pull Requests, every one reviewed and approved before merging, and every review answered — no approval was merged in silence.

### Review comments received, and how I responded

**PR [#22](https://github.com/FramePongrit/toktickit/pull/22) — My Tickets list API** · reviewer @SANOP19

> Review @FramePongrit:
> 1. **Strict Ownership Isolation:** Enforcing `requesterId` directly in the query `where` clause ensures solid multi-tenancy …

The reviewer singled out the decision to express ownership as a `where` clause rather than a post-fetch check. That was the intent — with the constraint in the query there is no code path that loads another Requester's row into memory before refusing it. Replied to confirm the reasoning and merged.

**PR [#34](https://github.com/FramePongrit/toktickit/pull/34) — Ticket Detail and attachments** · reviewer @narakosi-dev

> Peer Review Summary — PR #34: Ticket Detail Screen & Attachment Lifecycle. Excellent implementation of Issue 15 …

**My response:** "Glad to see ur approval. Thanks bro!!"

**PRs [#14](https://github.com/FramePongrit/toktickit/pull/14) and [#16](https://github.com/FramePongrit/toktickit/pull/16)** · reviewer @Leviathan-c137

Both approved with short informal notes; both answered before merging.

**PRs #18, #20, #24, #26, #28, #30, #32** · reviewer @narakosi-dev

Each carried a structured review covering architecture, specification conformance and test coverage, and each received a reply on the thread before the merge.

_(Attach screenshots of the PR conversations as evidence for Part 1.)_

---

## 2. Pull Requests I reviewed for others

| Repository | PR | Title | My verdict |
|---|---|---|---|
| [Leviathan-c137/toktickit](https://github.com/Leviathan-c137/toktickit) | [#33](https://github.com/Leviathan-c137/toktickit/pull/33) | Release: Lab 2 Sprint 2 — IT Service Desk Requester Portal | Approved, with a change requested in the comment |
| [Davidice23/toktickit](https://github.com/Davidice23/toktickit) | [#11](https://github.com/Davidice23/toktickit/pull/11) | docs: finalize Lab 1 submission evidence | Approved |

### The review I gave on Leviathan-c137/toktickit#33

> Overall looks good — the implementation is well structured and the test coverage is comprehensive.
>
> One issue before merging: `client/playwright.config.ts` uses `cmd /c` to start both the server and client:
>
> `cmd /c npm run dev --prefix ../server`
> `cmd /c npm run dev`
>
> `cmd` is Windows-specific, so `npm run e2e` will fail on macOS/Linux and most CI environments before Playwright can run the tests.
>
> Could we make these commands platform-independent, e.g.:
>
> `npm run dev --prefix ../server`
> `npm run dev`
>
> After that, looks good to merge 👍

This is a portability defect rather than a style preference: the tests would pass on the author's machine and fail for anyone else, which is exactly the class of problem that is invisible until someone else runs it.

**Author's response:** "DANKE!"

### The review I gave on Davidice23/toktickit#11

> W let's merge!!

A documentation-only PR finalising Lab 1 evidence, with nothing to correct.

---

## 3. What reviews looked for in this sprint

Because Lab 2 introduces ownership enforcement, reviews checked more than "does it run".

**Ownership is enforced by the server, not the screen.** A client-side filter that hides another Requester's ticket while the API still returns it is a defect, not a style point. Reviews checked the `where` clause, not just the rendered list — and @SANOP19's review on PR #22 called this out specifically.

**404 rather than 403 on ownership failure is deliberate.** A 403 confirms the resource exists, letting one Requester walk the id space to map another's data. The rationale is recorded in BR-13, api-spec §3, and as a comment in `ticket-detail.api.test.ts`, so a reviewer expecting 403 reads the reasoning before flagging it.

**A passing test is not evidence on its own.** Throughout the sprint each safety-critical behaviour was checked by deliberately breaking the implementation and confirming the test failed:

| What was broken | Test that caught it | Outcome |
|---|---|---|
| Removed `requesterId` from the ticket-detail `where` clause | API-34, API-35 | Failed as intended |
| Removed the orphan-file cleanup after a rejected upload | API-43 | Failed, with real files left in `uploads/` |
| Removed the secondary sort key | API-26 | **Passed** — the test was too weak and was rewritten |
| Removed `disabled={submitting}` from Submit | UI-04 | Failed as intended |
| Merged the empty and no-results states | UI-11 | Failed as intended |
| Made the download action unconditional on removed attachments | UI-23 | Failed as intended |

The third row is the one worth reading. The original stability test asserted only that no ticket appeared twice across pages, which PostgreSQL satisfies by accident at this data size whether or not the secondary key exists. It was rewritten to assert the tie-break directly, and only then did it fail when the key was removed.

**Lab 1 must keep working.** Every PR was checked to confirm the existing Lab 1 suites still pass unchanged. `App.tsx` and `api.ts` were never modified; the Lab 1 screen moved to `/system-check` instead.

**Automated tests do not replace looking at the screen.** 173 tests were green when Issue 16 first rendered the app in a browser, and three user-visible defects were sitting there: editable fields coloured like read-only ones, validation messages left standing beside corrected fields, and Bootstrap-blue pagination in an otherwise green interface. Issue 17's measurement pass then found two more: the brand flush against the viewport edge below the container width, and touch targets at 38–40px on mobile. All five are now covered by assertions.

---

## 4. Kanban evidence

Board: **TokTickIT Individual Sprints** — Backlog → Specified → Started → PR Review → Fixing → Done.

- Every Issue entered at Backlog and moved to Specified only after its requirements had been read and understood.
- Only the Issue actively being implemented sat in Started.
- Cards moved to PR Review only after the PR was linked to the Issue, so each card visibly carries its PR number.
- Because merges targeted `lab2-staging` rather than the default branch, GitHub did not auto-close the Issues; each was closed by hand when its card reached Done.

_(Attach the final board screenshot showing every Issue in Done.)_
