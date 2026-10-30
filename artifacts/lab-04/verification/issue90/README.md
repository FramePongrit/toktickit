# Issue #90 Dashboard UI verification

October 30, 2026 (Asia/Bangkok). Tested source: `5236ef59aa25be02ae578087449dfc07e35e4aea`, based on merged integration `171d8bc4d3022a5e67161983fb23fcac82f50da7`. Results are local executions, not CI or human approval.

Captured terminal logs have trailing spaces and tabs removed for Git whitespace checks; result lines, failures and timings are retained.

| Check | Actual evidence |
|---|---|
| Full client, serial | [19 files / 219 tests passed](client-full-final.txt), 80.42 seconds |
| Client production build | [Passed](client-build-final.txt) |
| Independent AI Reviewer | [6 files / 62 tests passed](reviewer-client.txt), 27.88 seconds |
| Dashboard browser | [1 test passed](browser-run-final-pass.txt), 29.4 seconds; Requester and Staff at 1440×900, 820×1024 and 390×844, zero horizontal overflow, keyboard activation and focus |
| Existing browser flows | [7 tests passed](browser-inherited-issue61.txt), authentication 3, Staff and attachment 2, Admin 2; inherited workflow and security checks retained |

Eight [actual screenshots](../../screenshots/issue90-dashboard/) include three sizes per role and mobile navigation identity. The AI Reviewer inspected all eight; the orchestrator also inspected Requester mobile and Staff desktop. This scoped visual check does not replace full release accessibility or final-main review.

An earlier parallel client run was reported to have eight failures. Its raw log, exact test names, time and source revision are unavailable, so their causes cannot be independently established.

On October 30 a separate current-source investigation ran with Node 24.19.0, Vitest 2.1.9 and 16 reported logical processors. The [default parallel run](client-parallel-reproduction.txt) failed 5 of 219 tests in AppShell, ChangePassword and ActionsTaken. The unchanged [two-worker run](client-two-worker-reproduction.txt) passed all 219 tests in 44.35 seconds, with the same assertions and timeout limits; the final [serial run](client-full-final.txt) also passed all 219. This comparison indicates sensitivity to execution conditions on this machine; it does not prove the cause of the earlier eight or identify a product defect. No test configuration was changed by this investigation.

Earlier browser startup, selector and harness failures are retained as separate logs; the passing runs did not erase them. Docker used only dedicated PostgreSQL16 container `toktickit-lab4-issue85-test` at loopback 55434. The inherited `issue61_verify_...` schema was dropped; the task-owned `lab4_issue90_e2e_20261030` schema is retained and the task upload directory is empty. Main database remained stopped. No full server rerun or full release E2E is claimed for this UI increment.

## PR #100 peer-review corrections

Correction source `90b6ec4d2285164cd27a181b88be95c5d28ef6a9` adds GitHub Actions client checks, sets the existing client test command to two workers, improves Queue pending/paste feedback, and protects authentication side effects across sessions. The original missing eight-failure log and separately failing default-parallel investigation remain recorded above; they are not retroactively explained.

| Check | Evidence |
|---|---|
| Default client command and build | [20 files / 228 tests passed](review-corrections/client-tests-final.txt); [build passed](review-corrections/client-build-final.txt) |
| Independent AI Reviewer | [7 files / 71 tests passed](reviewer-correction-client.txt) |
| Playwright discovery | [Default 26 tests / 8 files, Dashboard excluded; opt-in four lifecycle and one screenshot test](review-corrections/playwright-discovery-final.txt); [independent Reviewer discovery](reviewer-correction-discovery.txt) |
| Dashboard browser | [Four lifecycle tests passed](review-corrections/dashboard-lifecycle-final.txt); [one screenshot test passed](review-corrections/dashboard-screenshots-final.txt), six viewport captures report zero horizontal overflow |
| Inherited browser | [Seven authentication, Staff and Admin tests passed](review-corrections/inherited-auth-staff-admin-e2e-unseeded.txt); [last-Admin precondition and targeted rerun passed](review-corrections/last-active-admin-precondition-and-e2e-final.txt), with [independent SQL inventory](review-corrections/last-active-admin-sql-evidence.txt) |
| GitHub Actions | [Client checks on source commit](https://github.com/FramePongrit/toktickit/actions/runs/41019937070) passed tests, build and log upload. The PR's current head must have its own passing checks. |

Dashboard captures use a separate opt-in `dashboard-screenshots` project, rather than the existing Lab 2/3 screenshot project named in peer feedback; this retains the older project's selection and prevents unrelated skipped tests. [Correction screenshots](../../screenshots/issue90-review-corrections/) are retained; Reviewer inspected the new mobile captures. The first capture attempt timed out because mobile navigation was already open; [its output](review-corrections/dashboard-screenshots-project.txt) is retained. The [first inherited run](review-corrections/inherited-auth-staff-admin-e2e.txt) mistakenly included a seeded third active Admin; its 200/200 outcome is not evidence of a race defect. The clean unseeded rerun above passed, and exact active fixture IDs are now asserted around the race. [Cleanup](review-corrections/database-cleanup.txt) records removal only of the newly created isolated schema. Existing earlier logs were retained; CI uploads new run logs as a time-limited artifact.
