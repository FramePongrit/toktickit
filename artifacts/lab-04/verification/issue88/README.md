# Issue #88 verification

Date: 2026-10-29, Asia/Bangkok. Branch: `feature/lab4-actions-ui`; [PR #98](https://github.com/FramePongrit/toktickit/pull/98) into `lab4-staging`. Tested product/tests were committed unchanged as `60e9d9d0715af270eeb3b2422c9d54b7e02f017a`, based on reviewed integration `030f5da`. AI Reviewer confirmed that exact 18-file source commit. Subsequent changes are documentation, logs and screenshots only. Human approval/merge and final-main verification remain pending. These are local runs, not CI.

Environment: dedicated PostgreSQL16 container `toktickit-lab4-issue85-test`, loopback `127.0.0.1:55434`, disposable database `lab4test`, schema `lab4_issue88_base`. Commands explicitly set `DATABASE_URL` and `LAB4_PG_CONTAINER`; credentials/connection URL are omitted. Setup deployed all eight migrations and seeded only this test target. Existing application DB/container and application .env were not migrated/reset/edited. Sandbox loopback/pipe failures were retried against the same target with approved escalation. Output retains test/error content with sensitive data and trailing whitespace normalized.

| Command / scope | Final actual result | Complete output |
|---|---|---|
| `npm --prefix client test` | 17 files / 185 passed; 0 failed/skipped;29.61s, start14:16:52 | [Client final](client-tests-final.txt) |
| `npm --prefix client run build` | Exit0 | [Client build](client-build-final.txt) |
| `npm --prefix server run build` | Exit0 | [Server build](server-build-final.txt) |
| `npm --prefix server test -- --reporter=dot` | 26 files / 236 passed; 0 failed/skipped;128.13s, start14:19:35 | [Server final](server-tests-final.txt) |
| `npm run e2e -- --project=e2e e2e/lab-04/actions-taken-flow.spec.ts` | 1 passed;0 failed/skipped;17.6s | [Actions journey final](e2e-actions-taken-final.txt) |
| `npm run e2e -- --project=e2e e2e/lab-03/staff-ticket-flow.spec.ts` | 2 passed;0 failed/skipped;20.9s | [Inherited Staff/attachment browser](e2e-lab3-staff-ticket-flow.txt) |
| Independent Reviewer: new client Actions/date/tabs files (exact commands in output) | Superseding run3files/31passed;0 failed/skipped;19.56s | [Reviewer client](reviewer-client.txt) |
| Independent Reviewer: Actions browser journey, same isolated target | Initial1failed; unchanged repeat1passed/11.6s/exit0 | [Both complete browser attempts and trace diagnosis](reviewer-browser.txt) |
| Explicit isolated migrate/seed | Eight migrations and seed exit0 | [Setup](schema-seed.txt) |

The full server run includes auth/security21 and migration/seed/recovery/runbook12 tests; those dedicated scripts were not independently rerun for this increment. The helper fix excludes TICKET_CANCEL child revisions from parent version counting while retaining per-child revisions and explicit migration seed CREATED-event checks. The two-child cancellation API case asserts the intended one-parent-increment policy. Removal of the unreachable non-Waiting publicComment branch retains the previous rejection assertion.

The new browser journey uses task-owned Requester, Staff and second Staff fixtures. It selects one Staff as assignee and completes as another, checks actual rendered performer, creates/edits/completes/corrects/cancels Actions, reads human-labelled history, exercises gate/resolve/reopen and verifies Requester-owned historical read-only output. A second Staff changes priority while a correction draft is open: old-version submission409 retains fields; loading current data does not submit; explicit review approval and deliberate retry succeed. A simulated ambiguous503 proves exact body/key replay. End-key tab navigation, untouched create date omission, disabled outline computed `rgb(0,107,60)` and geometry at1440x900/820x1024/390x844 passed.

Earlier browser attempts had harness assumptions about already-open audit, collapsed mobile Logout and locating a desktop row. Their complete outputs remain in [initial attempt](e2e-actions-taken.txt) and [intermediate attempt](e2e-actions-taken-pass.txt); the latter filename does not mean that attempt passed. They are superseded by the explicitly labelled final output. Earlier client/build runs are retained in client-tests.txt/client-build.txt. The independent client output retains act warnings from two rerender cases; the test-only awaiting correction was followed by the final185-test run, whose output has no such warnings.

**Independent browser limitation:** the first attempt saved/audited successfully but timed out waiting for Edit to become enabled. Trace showed parent-detail GET pending beyond the5s assertion while prior PATCH/history requests were fast. One unchanged repeat passed. Both outcomes are retained; source review found no reproducible busy-state defect, but the passing retry does not prove that delay cannot recur. No timeout was increased or failed output erased to obtain this result.

Reviewer verified scoped fixture users/tickets=0 for both exact independent run tags and free API/client ports3000/5173. Task-owned ignored diagnostic output remains for the failed attempt; no shared upload root was changed. Only the corrected full-page conflict frame from the independent passing run replaced its curated PNG, with matching SHA256 `F27BF1D86D29EDC1BD648463F765A34AD4DBF7540F9162F2427A49164DB97113`. [Screenshot index](../../screenshots/actions-taken/README.md) identifies the actual visual evidence. Root and AI Reviewer inspected it; no human visual approval is implied.

This completes the Actions UI increment and initial STYLE/UI/E2E evidence. Dashboard work, broader Lab4 E2E, full manual accessibility/increased-text checks, CI follow-up from PR97, release and final-main evidence remain later work. It does not claim the whole Lab4 DoD complete.
