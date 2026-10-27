# Issue #86 verification

Date: 2026-10-26, Asia/Bangkok. Branch: `feature/lab4-actions-api`; [PR #96](https://github.com/FramePongrit/toktickit/pull/96) into `lab4-staging`. Tested product/test source committed unchanged as `617bd9d65bf11dbc221a8f7ad839d0bb871c171b`, based on reviewed merge `4d487a1`. Subsequent documentation/evidence commits do not alter executable source or fixtures. The AI Reviewer confirmed this exact source commit after reviewing the working tree and independently running the five new suites. Human review/merge and final-main verification remain pending; these results are local runs, not GitHub CI.

Environment: dedicated PostgreSQL 16 container `toktickit-lab4-issue85-test`, loopback `127.0.0.1:55434`, disposable database `lab4test`. Server runs explicitly set `DATABASE_URL` to schema `lab4_issue86_base` and `LAB4_PG_CONTAINER` to that container. Migration/recovery tests create their own schemas/databases. Connection credentials are omitted. The configured application database/container was not migrated or reset.

Output is sanitized for sensitive connection data; trailing whitespace and extra blank EOF lines are normalized for Git integrity checks. Test results, errors and assertions are retained.

| Command / scope | Actual result | Complete output |
|---|---|---|
| `npm --prefix server test` | 24 files / 227 passed; 0 failed/skipped; 61.87s, start 03:43:17 | [Server](full-server-tests.txt) |
| `npm --prefix server run test:migration` | 4 files / 12 passed; 0 failed/skipped | [Migration/recovery/runbook](migration.txt) |
| `npm --prefix server run test:security` | 1 file / 21 passed; 0 failed/skipped | [Security](security.txt) |
| `npm --prefix client test` | 14 files / 151 passed; 0 failed/skipped | [Client](client-tests.txt) |
| `npm --prefix server run build` | Exit 0 | [Server build](server-build.txt) |
| `npm --prefix client run build` | Exit 0 | [Client build](client-build.txt) |
| `npm run e2e -- e2e/lab-03/staff-ticket-flow.spec.ts --project=e2e` | 2 passed; 0 failed/skipped | [Browser](staff-ticket-flow-e2e.txt) |
| Independent Reviewer: five new server test files (full command in log) | 5 files / 21 passed; 0 failed/skipped; 7.78s, start 03:40:00 | [Reviewer](reviewer-focused.txt) |
| `git diff --check` | Exit 0; line-ending notices only | [Integrity](git-diff-check.txt) |
| Read-only E2E schema cleanup assertion | 0 remaining owned schemas | [Cleanup](e2e-isolated-schema-cleanup.txt) |

The new focused files cover Action lifecycle, effective-field validation, revision snapshots, terminal corrections, Requester privacy/write denial, CSRF, cross-Ticket resources, stale versions, ordered Admin/assignee locks, parent finality, same-Action races, concurrent scope-key replay, current sessions after waiting, and injected transaction rollback. Expected injected-failure stderr is retained and labelled in the Reviewer log. Earlier focused results are preserved in [focused-extra.txt](focused-extra.txt); the full-server run supersedes their totals.

Browser verification deployed all eight migrations and seeded a fresh `issue61_verify_*` task-owned schema using the existing isolated E2E setup pattern, then started test API/client processes on the existing Playwright ports. Only this two-test file ran. It covers real Staff Claim/Reassign/Priority/status/guards and Requester attachment upload/download/removal. The first run hit an IdempotencyRecord FK during fixture-user teardown; [initial failure](staff-ticket-flow-e2e-initial-failure.txt) is retained. Cleanup now deletes records scoped to those fixture User IDs before their Users; the complete file passed on a new schema. Harness processes, fixture uploads and schema were cleaned afterward. No required assertion was removed to pass.

The resolution gate, reopen-cycle increment, atomic parent cancellation and public workflow API belong to #87; new Actions UI belongs to #88. Full Lab 4 browser coverage, dashboard/performance, responsive screenshots and final-main verification remain future work. This evidence does not claim those features complete.
