# Issue #89 Dashboard API verification

October29,2026, Asia/Bangkok. [PR99](https://github.com/FramePongrit/toktickit/pull/99), branch `feature/lab4-dashboard-api`, integration base `6b1277d5e0335f5e8013cd1cc60248c6eeafc668`. Tested source committed as `6f08f4e5e1a7ccaf5d53d3240d7cc28d7dc65495`; only an extra EOF blank line was removed after Executor handoff. Independent AI review confirmed exact source; human approval/merge pending. Later evidence/documentation commits do not change executable source. These are local runs, not GitHub CI checks.

Environment: existing dedicated PostgreSQL16 container `toktickit-lab4-issue85-test`, loopback55434, synthetic `lab4test` database. Normal regression uses `lab4_issue89_base`; the opt-in1000Ticket/5000Action benchmark uses fresh `lab4_issue89_perf`. Process-local test configuration overrides the application environment. Main `toktickit-db` remains stopped. Connection credentials and auth/session hashes are omitted.

Captured terminal logs have trailing spaces/tabs removed for Git whitespace checks; result lines, errors, SQL and timings are retained.

| Evidence | Actual result / disposition |
|---|---|
| [Focused Dashboard/rules](dashboard-focused.txt) |2files/11tests passed before final harness corrections |
| [Full client](client-full.txt) |17files/191tests passed, zero failures,68.37s; includes narrow PR98 follow-ups |
| [Final full client](client-full-final.txt) |17files/196tests passed, zero failures/skips,61.10s, after URL/calendar corrections |
| [Initial URL-focused client](client-url-focused.txt) |38passed/1failed: Staff navigation test looked for mismatched display label; corrected assertion checks labelled Status control's enum value |
| [URL-focused client rerun](client-url-focused-rerun.txt) |2files/39tests passed after URL/calendar fixes |
| [Requester/query contract](requester-list-contract.txt) |4files/41tests passed including both unsupported-query400 safe-envelope/no-data assertions and Dashboard/rules |
| [Initial full server](full-server.txt) |28files/247tests:245passed/2failed; inherited unknown-requesterId query expected200, approved strict contract returns400. Final corrected rerun required |
| [Final full server](full-server-final.txt) |28files/247tests passed, zero failures/skips,138.47s; includes security/migration/recovery suites rather than separate repeated commands |
| [Additional captured server run](full-server-final-rerun.txt) |Same28files/247tests passed182.44s; already-started duplicate after logging coordination issue, no source change |
| [Server build](server-build-final.txt), [client build](client-build-final.txt) |Both production builds exit0 |
| [Initial combined browser](browser-regression.txt) |2passed/1failed: attachmentPOST500 in manual-server harness; no confirmed cause/product fix |
| [Attachment-only diagnostic](browser-attachment-rerun.txt), [manual Staff diagnostic](browser-staff-debug.txt) |Playwright stalled before browser execution, bounded runners stopped; exact owned schemas cleaned, API stderr empty; not passed test evidence |
| [Canonical Staff diagnostic](browser-staff-debug-managed.txt) |2/2Staff cases passed including upload/download/remove, no product fix; temporary diagnostic instrumentation removed |
| [Final canonical combined browser](browser-regression-final.txt) |3/3passed36.7s: Staff workflow, attachment upload/download/remove, Actions lifecycle; exact schema dropped/zero remaining, owned uploads removed |
| [Initial PERF](perf01.txt) |Failed independent SQL alias assertion before timings; preserved |
| [Provisional PERF rerun](perf01-rerun.txt) |Earlier benchmark timings; superseded by guarded final run below |
| [Final guarded PERF](perf01-final.txt) |1test passed7.50s; exact1000Tickets/5000Actions/5000revisions/1000events,7authenticated endpoints with3warmups/20samples each; independent SQL values/content assertions, nonzero query events and3EXPLAIN plans |
| [Initial sentinel harness](perf-guard-nonempty.txt) |tsx eval top-level-await error; no sentinel/suite execution |
| [Sentinel harness retry](perf-guard-nonempty-rerun.txt) |Connection P1001 while test container stopped; no sentinel or cleanup performed |
| [Wrong-target refusal](perf-guard-wrong-target.txt) |Expected exit1 before DB access; intentionally skipped test body, not a regression pass |
| [Nonempty-schema sentinel](perf-guard-nonempty-final.txt) |Expected setup refusal preserved exact synthetic Category sentinel; removed only that sentinel; five table inventories empty before/after |
| [Independent API/rules](reviewer-focused.txt) |2files/11tests passed11.10s after retained sandboxP1001 setup refusal; directpsql taggedTickets/Users0/0; exact6f08f4e confirmed |
| [Independent PERF/SQL](reviewer-perf-sql.txt) |1test passed9.53s, exact1000/5000,7endpoints3warmups20samples,maxp9578.62ms; directpsql all7fixturetables empty. A tsxeval with no inventory output is explicitly not cleanup evidence |

| Endpoint | Final nearest-rank p95, milliseconds |
|---|---|
| Requester Dashboard |18.71 |
| Staff Dashboard |25.49 |
| Requester recent updates |14.73 |
| Requester resolutions |14.00 |
| Staff priority-recent |31.31 |
| Active assigned Actions |31.51 |
| Completed performed Actions |30.86 |

All seven are below the2000ms budget. These are sequential local measurements, not a concurrency/load claim.

Human approval/merge and later release verification remain pending. The original manual-server attachment500 did not reproduce in canonical Staff and combined reruns; its cause remains unconfirmed. Do not describe it as a fixed product defect or erase the initial failure. The191client pass precedes the later URL synchronization/calendar corrections; the196test final run supersedes it. Existing tracked Issue88 screenshots were not overwritten; temporary browser screenshots are not a new manual visual-QA claim.

Reproduce the explicit performance command and fixture restrictions using [tests.md section15](../../../../docs/lab-04/tests.md#15-issue-89-dashboard-api-verification-protocol). The default server suite deliberately excludes only the standalone performance file. Run both normal and opt-in suites; the latter is required rather than skipped.
