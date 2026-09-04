# Lab 2 — Peer Review Record

**Author:** _<your name>_ — _<student id>_ — GitHub: @_<username>_
**Peer reviewer:** _<partner name>_ — _<student id>_ — GitHub: @_<username>_

**Repository:** https://github.com/FramePongrit/toktickit
**Integration branch:** `lab2-staging` → released to `main` by one final Pull Request

---

## 1. Pull Requests I authored (reviewed by my partner)

Every feature branch reached `lab2-staging` through a reviewed Pull Request. Each PR was linked to its Issue through the Development panel on the PR page, since a `Closes #n` keyword does not create the link when the PR targets a non-default branch.

| Issue | Branch | PR | Reviewer verdict | Merged |
|---|---|---|---|---|
| #5 Lab 2 specification and test plan | `feature/5-lab2-spec-docs` | | | |
| #6 Data model, migrations, and seed | `feature/6-data-model-and-seed` | | | |
| #7 Server architecture + reference APIs | `feature/7-server-architecture-and-reference-apis` | | | |
| #8 Create Ticket API | `feature/8-create-ticket-api` | | | |
| #9 My Tickets list API | `feature/9-my-tickets-api` | | | |
| #10 Ticket Detail API + ownership | `feature/10-ticket-detail-api` | | | |
| #11 Attachments API | `feature/11-attachments-api` | | | |
| #12 Client foundation | `feature/12-client-foundation` | | | |
| #13 Create Ticket screen | `feature/13-create-ticket-screen` | | | |
| #14 My Tickets screen | `feature/14-my-tickets-screen` | | | |
| #15 Ticket Detail + attachments | `feature/15-ticket-detail-and-attachments` | | | |
| #16 Playwright E2E + screenshots | `feature/16-e2e-and-screenshots` | | | |
| #17 Visual inspection + docs | `feature/17-visual-review-and-docs` | | | |
| #18 Lab 2 release | `lab2-staging` → `main` | | | |

### Review comments I received, and how I responded

> **PR #_<n>_ — _<branch>_**
> **Reviewer comment:** _<paste the comment>_
> **My response:** _<what I changed, or why I disagreed>_
> **Outcome:** _<pushed fix to the same branch / discussed and kept as-is>_ — conversation resolved after replying.

_(Repeat for each comment received. An approval with silence beneath it does not count as a review, so every comment must have a reply.)_

---

## 2. Pull Requests I reviewed for my partner

| PR | Branch | My verdict | Merged by me |
|---|---|---|---|
| | | | |

### Comments I gave, and how my partner responded

> **PR #_<n>_ — _<branch>_**
> **My comment:** _<what I asked for, referencing the acceptance criterion it relates to>_
> **Partner's response:** _<their reply>_
> **Outcome:** _<approved after fix / approved as-is>_

_(Per the lab agreement, after approving I clicked "Merge pull request" myself rather than leaving it to the author.)_

---

## 3. Review focus for this sprint

Because Lab 2 introduces ownership enforcement, reviews checked more than "does it run":

- **Ownership is enforced server-side.** A client-side filter that hides another Requester's ticket while the API still returns it is a defect, not a style issue. Reviewers verified the `where` clause, not just the screen.
- **404 rather than 403 on ownership failure.** This is deliberate — see BR-13 and api-spec §3. A reviewer expecting 403 should read the rationale before flagging it.
- **Tests assert the specified reason.** A test that passes for the wrong reason, or one that is skipped, was treated as a missing test.
- **The specification is the contract.** Deviations from api-spec.md or ui-spec.md were either corrected in the code or the specification was updated deliberately and noted in the PR.
- **Lab 1 must keep working.** Every PR was checked to confirm the existing Lab 1 test suites still pass unchanged.

---

## 4. Kanban evidence

Board: **TokTickIT Individual Sprints** — columns Backlog → Specified → Started → PR Review → Fixing → Done.

- Every Issue entered at Backlog and moved to Specified only after its requirements were read and understood.
- Only the Issue actively being implemented sat in Started.
- Cards moved to PR Review only after the PR was linked to the Issue, so each card visibly carries its PR number.
- Cards that failed review moved to Fixing, then back to PR Review once the fix was pushed to the same branch.
- Because merges targeted `lab2-staging` rather than the default branch, GitHub did not auto-close the Issues; each was closed by hand when its card reached Done.

_(Attach the final board screenshot showing every Issue in Done.)_
