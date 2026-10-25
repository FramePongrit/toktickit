# PR #95 correction verification

Date: October 25, 2026 (Asia/Bangkok). Source: correction commit `9b29487b47bdb00deec87f02227e3f3612295d4a`, following reviewed PR head `0e958d5`.

Executor ran the final working source, which was committed unchanged as `9b29487`. The Reviewer then independently checked that commit. Evidence/documentation commits after it do not change executable source or test fixtures. These files are actual local command output, not GitHub CI checks.

| Evidence | Command / result |
|---|---|
| [Migration, recovery and runbook](migration-recovery-runbook.txt) | `npm --prefix server run test:migration`: 4 files / 12 tests passed |
| [Independent Reviewer migration/recovery](reviewer-migration-recovery.txt) | Same command on commit 9b29487: 4 files / 12 tests passed, 0 failed/skipped; 103.31 seconds |
| [Full server](full-server.txt) | Test-base migration deploy, then `npm --prefix server test`: 19 files / 206 tests passed, including 21 security and 5 Windows runbook tests |
| [Prisma and build](prisma-build.txt) | Prisma validate/generate and `npm --prefix server run build`: exit 0 |
| [Diff integrity](diff-integrity.txt) | Diff check and original migration unchanged: exit 0 |

Environment: dedicated PostgreSQL 16 container `toktickit-lab4-issue85-test`, bound to `127.0.0.1:55434`, disposable `lab4test` database and task-owned schemas/databases. Full server regression used base schema `lab4_issue85_base` after applying all eight migrations. Credentials and connection URLs are omitted from published output.

Recovery uses real PostgreSQL `pg_dump`/`pg_restore` and real recovered-app auth, CSRF, password/session and attachment download handlers. The Windows README tests execute the documented PowerShell blocks in fresh processes, use real temporary files, and stub the external database tools; they prove input ordering/checksum handling without creating real databases through the runbook.

The original migration's raw Git blob is unchanged: `593d4e9c3a20dd51797aeb11837ca6a534c9c0ac`, checked with `git rev-parse 0e958d5:server/prisma/migrations/20261024000000_lab4_actions_workflow/migration.sql` against `git hash-object --no-filters` for the current file. The follow-up migration changes the FK atomically. Regression tests assert FK deletion rejection (`23503`, not the former CHECK violation) and unchanged rows/history.

To reproduce on Windows, configure an explicitly disposable loopback PostgreSQL database named `lab4test` and set `DATABASE_URL` plus `LAB4_PG_CONTAINER` to that isolated environment. Generate Prisma, deploy migrations only to the disposable base schema, then run the commands above. Client/browser/performance and later feature work are outside this correction round.
