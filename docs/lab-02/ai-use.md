# Lab 2 — AI Use and Reflection

**LLM / agent used:** Claude Opus 5 and Claude Sonnet 5, through Claude Code in VS Code. Opus was used for planning and design, Sonnet for implementation.

Prompts were recorded verbatim as the sprint progressed, in a running log kept outside the repository. The table below selects the eight that changed the outcome most; nothing here was reconstructed from memory afterwards.

---

## Selected key prompts

| # | Prompt (summarised) | What I did with the result |
|---|---|---|
| 1 | "อ่าน lab2 หน่อย เขาให้ทำอะไรบ้าง สรุปหน่อย และยังมีรายละเอียดของ git workflow ด้วย" — read both PDFs and summarise the work and the git workflow | The agent read all 42 pages and separated the product scope from the process requirements. This is where I first saw that the specification had to be merged *before* any implementation PR, which changed the order of everything that followed. |
| 2 | "อธิบาย git workflow ให้เข้าใจใหม่หน่อย แบบมือใหม่" — explain the git workflow again, for a beginner | Corrected a misconception I had carried since Lab 1: typing `Closes #18` in a PR description does **not** link the PR to the Issue when the PR targets `lab2-staging`, because that is not the default branch. GitHub records it as a plain mention. Every PR in this sprint was therefore linked by hand through the Development panel. |
| 3 | "ok งั้นเราจะเริ่มยังไงดี" — so how should we start? | Instead of answering, the agent inspected the repository and found that Lab 1 was not actually finished: `main` still held only the first commit, Issue 4 had no PR, and two documentation files were uncommitted. Had I branched `lab2-staging` from `main` at that moment, it would have carried none of Lab 1. |
| 4 | A ~2,500-word design brief handed to a planning sub-agent, carrying the full labsheet requirements, the exact current state of the codebase, and four decisions already fixed | Produced the technical design the whole sprint was built on. The arguments I could not have made myself were about *why*: why a counter table beats `MAX(ticketNumber)+1` for allocating ticket numbers under concurrency, why an ownership failure should answer 404 rather than 403, and why every sort needs a secondary key. |
| 5 | Four architecture decisions answered in one exchange: identity in an `X-Requester-Id` header; attachments on disk with metadata in Postgres; Playwright for E2E; one Issue at a time | Each option came with its trade-off rather than a recommendation alone. The header decision is the one that pays off later: Lab 3 replaces the body of a single middleware with token verification and no route handler changes. |
| 6 | "ให้เก็บทุก prompt ที่เกี่ยวข้องกับ task ไม่ต้องสรุป" — record every prompt verbatim, do not summarise | Changed the log from a condensed table into full transcripts, including the long ones and the ones that went wrong. This document is distilled from that log rather than from recollection, which is what the sprint asks for. |
| 7 | Standing instruction applied from Issue 8 onward: after a test passes, break the implementation deliberately and confirm the test fails | This caught the most important defect of the sprint. The pagination-stability test passed **with the secondary sort key removed**, because PostgreSQL happens to return a consistent order at this data size. The test proved nothing and had to be rewritten to assert the tie-break directly. Five other checks failed correctly when broken, which is what made them worth trusting. |
| 8 | Issue 16: install Playwright, run the app for real, and look at the screenshots | 173 automated tests were green. Rendering the app in a browser immediately exposed three user-visible defects none of them covered — editable fields the same colour as read-only ones, validation messages left standing beside corrected fields, and Bootstrap-blue pagination in an otherwise green interface. A follow-up measurement pass found two more. |

---

## How the agent was used in each phase

| Phase | How the agent was used | What stayed my responsibility |
|---|---|---|
| Understanding the brief | Read both PDFs, separated product scope from process requirements | Deciding that the spec-before-code ordering drove the whole issue sequence |
| Specification (Issue 5) | Drafted all six documents from the labsheet plus the design output | Checking that all 48 acceptance criteria mapped to a planned test, and that the business rules covered every area §4.3 requires; choosing the field-length bounds and requiring a written justification for each |
| Data model (Issue 6) | Wrote the schema, split the migrations, extended the seed | Verifying the migration SQL, that the seed is idempotent across two runs, and that Category ids stayed 1–4 so the Lab 1 test kept passing |
| APIs (Issues 7–11) | Implemented routes, services, validation and 81 server tests | Requiring each safety-critical test to be proven by breaking the code; reviewing every error code against api-spec |
| Frontend (Issues 12–15) | Built the router, context, theme, four screens and 76 client tests | Insisting `App.tsx` and `api.ts` stay untouched so the graded Lab 1 tests kept passing |
| E2E and evidence (Issue 16) | Wrote the Playwright suites and the capture script | Actually looking at the screenshots, which is where five defects were found |
| Review and docs (Issue 17) | Measured layout geometry, drafted this documentation | Confirming the peer-review record against the real GitHub data rather than letting anything be invented |

---

## My Reflection

The single most useful habit this sprint was refusing to accept a green test as evidence. From Issue 8 onwards, every time a safety-critical test passed I asked for the implementation to be broken deliberately to confirm the test would catch it. Five times it failed exactly as it should. Once — the pagination stability test — it kept passing with the secondary sort key removed, because PostgreSQL returns a consistent row order at this data size whether or not the key is there. That test was asserting nothing. It was rewritten to check the tie-break directly, and only then did it fail when the key was removed. Without that step I would have shipped a test that looked like coverage and was not.

The second lesson was that automated tests and a working screen are different claims. When Issue 16 first rendered the app in a browser, 173 tests were green and three defects were plainly visible: every editable field had taken the page background colour because Bootstrap ties `.form-control` to `--bs-body-bg`, which the theme had repointed; validation messages stayed beside fields I had already corrected; and the pagination control was still Bootstrap blue. None of my tests asserted a colour or a stale message, so none of them noticed. A measurement pass in Issue 17 then found the brand sitting flush against the viewport edge and touch targets at 38–40px on mobile. The labsheet's insistence on inspecting against `ui-spec.md` rather than from memory turned out to be the point, not a formality.

Where I had to overrule the agent, it was usually about my own tests rather than the implementation. Several times a test failed and the fault was mine: a page size of 5 that the contract does not allow, inconsistent fixture data, and a Playwright button reference captured before a re-render and therefore detached from the DOM. Reading each failure properly before changing anything mattered, because the reflex to "fix the code until the test goes green" would have damaged working behaviour in at least two of those cases.

_(Review this reflection and adjust it to your own voice before submitting.)_
