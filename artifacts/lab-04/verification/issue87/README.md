# Issue #87 verification

Date: 2026-10-28, Asia/Bangkok. Branch: `feature/lab4-ticket-workflow`; [PR #97](https://github.com/FramePongrit/toktickit/pull/97) into `lab4-staging`. Tested source/tests were committed unchanged as `99f9e450fa5bef4c8080dd82aa064ed793ea3479`, based on reviewed integration `e6e782d`. The AI Reviewer confirmed that exact 30-file commit after reviewing the final UI regression and independently executing the new rules/workflow files. Subsequent changes are documentation/evidence only. Human approval/merge and final-main verification remain pending. These are local runs, not CI.

Environment: dedicated PostgreSQL 16 container `toktickit-lab4-issue85-test`, loopback `127.0.0.1:55434`, disposable database `lab4test`. Server runs explicitly target schema `lab4_issue87_base` using `DATABASE_URL` and set `LAB4_PG_CONTAINER` to that container. Migration/recovery tests use additional generated task-owned schemas/databases. Connection credentials are omitted; no application DB migration/reset was performed. Output is sanitized and trailing whitespace/extra EOF blank lines are normalized; test/error content remains.

| Command / scope | Actual result | Complete output |
|---|---|---|
| `npm --prefix server test` | 26 files / 236 passed; 0 failed/skipped; 71.85s, start 02:29:19 | [Server](server-full-suite.txt) |
| `npm --prefix server run test:security` | 1 file / 21 passed; 0 failed/skipped | [Security](server-security.txt) |
| `npm --prefix server run test:migration` | 4 files / 12 passed; 0 failed/skipped | [Migration/recovery](server-migration-suite.txt) |
| `npm --prefix client test` | 14 files / 153 passed; 0 failed/skipped; 12.28s, start 02:33:53 | [Client](client-full-suite.txt) |
| `npm --prefix server run build` | Exit 0 | [Server build](server-build.txt) |
| `npm --prefix client run build` | Exit 0 | [Client build](client-build.txt) |
| Playwright `e2e/lab-03/staff-ticket-flow.spec.ts --project=e2e --reporter=line --output=<owned temporary directory>` | 2 passed; 0 failed/skipped; 15.2s | [Browser and cleanup](staff-ticket-flow-e2e.txt) |
| Independent Reviewer: `npm --prefix server test -- --run tests/lab-04/ticket-rules.unit.test.ts tests/lab-04/ticket-workflow.api.test.ts` | 2 files / 9 passed; 0 failed/skipped; 5.56s | [Reviewer](reviewer-focused.txt) |

The new files implement UNIT-02, API-W01-05 and the new Action/status race portion of API-C03. Existing legacy matrix/Owner/finality assertions remain; their fixtures gain valid current-cycle completion evidence/cancellation reasons and scoped FK-safe cleanup. Tests cover current-cycle gate blockers and audited follow-up correction, cancelled-only rejection, repeated resolve/reopen cycles and replay, resulting-cycle events, retained resolution time on Close, old-cycle read-only work, atomic cancellation shared actor/time/reason/history, unchanged terminal Actions, rollback after revision/event failure and same-key retry, CREATED atomic with Ticket creation, labelled BASELINE/public projection, stable ties/pagination and own/foreign/final reads. Three injected-failure stderr entries are expected and their rollback/retry assertions passed.

Initial race tests timed out because both requests started before the intended winner reached its lock barrier. Corrected tests first wait for that parent's lock, then issue the loser and observe PostgreSQL `wait_event_type=Lock`; both directions passed individually and in the full run. Increasing timeouts alone was not the correction. Initial sandbox runs also failed before tests at DB seed or on localhost socket permissions; escalated runs against the same isolated target passed. These environmental failures are not counted as successful product runs.

Browser verification migrated/seeded a fresh `issue61_verify_*` schema, started owned API/Vite processes on loopback ports 35617/35618 and used temporary uploads. The targeted file ran with the corresponding API/client URL overrides and existing-server mode. It creates/completes Action evidence through the real API before the existing UI resolution flow, then retains communication, ownership, finality and attachment assertions. The logged cleanup confirms zero remaining owned schemas, free ports and removed temporary uploads/output. This is a Staff workflow regression, not a completed Actions UI browser suite.

Minimal Staff UI changes are covered by the full client suite, including cancellation reason submission/validation, gate feedback, truthful unknown legacy resolution times and in-place navigation clearing a previous Ticket's cancellation intent. Full Actions UI (#88), Dashboard, full Lab 4 E2E/screenshots/accessibility/performance and release/final-main evidence remain later increments.
