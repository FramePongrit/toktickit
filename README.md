# TokTickIT

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and Network requests.

An authenticated Requester can create a ticket and receive an official ticket number, find their own tickets through search, filters, sorting and pagination, open a ticket, and upload, download and soft-remove attachments. Ownership is enforced by the backend: one Requester cannot read another's ticket or attachment.

Authentication uses an eight-hour session cookie. The browser restores the current User through `/api/auth/me`; the server derives Ticket and Attachment ownership from that authenticated User and never from a client-supplied requester id. State-changing requests also send the session's `X-CSRF-Token` header. Lab 4 adds Staff/Admin Actions, Ticket workflow history and resolution gates, and role-specific Dashboards while retaining the existing Requester, Staff and Admin access controls.

## Setup

### 1. Prerequisites

- Node.js v18 or later
- PostgreSQL v14 or later

### 2. Database

Ensure PostgreSQL is running and a database named `toktickit` exists, matching the credentials in `server/.env`.

Using Docker:

```bash
docker run --name toktickit-db -e POSTGRES_USER=toktickit -e POSTGRES_PASSWORD=toktickit \
  -e POSTGRES_DB=toktickit -p 5432:5432 -d postgres:14
```

### 3. Server

```bash
cd server
npm install
cp .env.example .env          # then check DATABASE_URL
npx prisma migrate deploy     # applies all migrations
npx prisma db seed            # idempotent: safe to run repeatedly
```

The server automatically loads `server/.env` for both `npm run dev` and `npm start`; environment variables injected by the host take precedence over values in the file. Set `JWT_SECRET`, `CLIENT_ORIGIN`, and the local-development cookie settings from `server/.env.example` before starting Lab 3.

The seed creates the four categories, seven related systems, local Users, and demo Tickets/Actions/workflow history used by the application and tests. It is repeatable: it does not reset a user's changed password or overwrite existing Ticket work to recreate the demo.

### Local seeded accounts

The seed uses local-only fixture credentials. These values are for a disposable development database only, never production credentials:

| Role | Example email | Seed password |
|---|---|---|
| Requester | `jennifer.anderson@kmutt.ac.th` | `TokTickIT123!` |
| IT Staff | `niran.support@kmutt.ac.th` | `TokTickIT123!` |
| Administrator | `kanya.admin@kmutt.ac.th` | `TokTickIT123!` |

Freshly seeded Users start in the mandatory-password-change flow. A migrated Lab 2 Requester receives the same local-only fixture input only when its legacy credential hash is missing; repeat seed/migration does not overwrite an established changed password.

### Lab 4 demo walkthrough

Use a disposable local database. Sign in as the Requester to open the Requester Dashboard and My Tickets; the demo includes active, resolved, reopened and legacy Tickets. Sign in as IT Staff to see assigned active Actions, open a Ticket and use **Actions Taken** to inspect cycles, create or update an Action, record completion/cancellation, and view the readable audit and public workflow timeline. Resolve requires completed current-cycle work with no unfinished Action or unresolved completed follow-up; reopening starts a new work cycle. The Administrator uses the Staff Dashboard and also has User Management access. Seeded Users begin with the mandatory password-change flow, so change the password at first login. Use only the disposable seed password shown above in a local development database.

### 4. Client

```bash
cd client
npm install
cp .env.example .env          # then check VITE_API_URL
```

### 5. End-to-end tooling (optional)

```bash
npm install                   # in the repository root
npx playwright install chromium
```

## Running

Two terminals:

```bash
cd server && npm run dev      # http://localhost:3000
cd client && npm run dev      # http://localhost:5173
```

Uploaded attachments are written to `server/uploads/`, which is created at boot. Its contents are gitignored; the directory itself is kept by a committed `.gitkeep`.

## Testing

```bash
cd server && npm test         # Vitest + Supertest, against a migrated and seeded database
cd client && npm test         # Vitest + React Testing Library
npx playwright test           # end-to-end and screenshot capture, starts both servers itself
```

Lab 4 verification uses explicitly isolated resources; do not run these commands against the configured application database or the primary `toktickit-db` container.

- The server suite runs sequentially and uses a disposable PostgreSQL 16 database named `lab4test` on `127.0.0.1:55434`. Set process-local `DATABASE_URL` to that test database and `LAB4_PG_CONTAINER=toktickit-lab4-issue85-test`. Migrate and seed the task-owned base schema before `npm --prefix server test`. The default server config excludes the deliberately separate 1,000-Ticket/5,000-Action performance fixture and the Windows-only backup/restore runbook; run both with their explicit commands below.
- `npm --prefix server run test:security` runs the security configuration; `npm --prefix server run test:migration` runs migration/recovery; `npm --prefix server run test:runbook` runs the Windows PowerShell backup/restore-script cases; `npm --prefix server run test:performance` opts into the separately guarded performance fixture. The runbook suite is Windows-only. The recovery suite uses Docker PostgreSQL tools through `LAB4_PG_CONTAINER`.
- `npm --prefix client test` runs the component suite with the configured two-worker budget; `npm --prefix client run build`, `npm --prefix server run build`, and Prisma validate/generate are separate build checks.
- For the isolated Lab 4 browser/regression/capture workflow, start the dedicated test PostgreSQL container, set an explicit test-only `DATABASE_URL` and `LAB4_PG_CONTAINER`, then run `powershell -ExecutionPolicy Bypass -File e2e/run-lab04.ps1 -ApiPort 3001 -ClientPort 5174`. The runner checks the exact loopback database, refuses occupied ports, creates and drops only its random task-owned schemas and upload root, and restores process environment variables. Routine screenshots go to ignored `test-results/lab-04/run-<id>/screenshots`. Pass `-ScreenshotRoot artifacts/lab-04/screenshots` only when intentionally refreshing curated evidence.
- `npm run e2e` and `npm run screenshots` invoke Playwright directly; they do not provide the isolated schema/upload/port setup of `e2e/run-lab04.ps1`. Use the runner for Lab 4 browser verification. The separate Dashboard capture project is included by the runner; screenshot defaults never write curated files unless the explicit `ScreenshotRoot` is supplied.
- Lab 2/3 runners remain available for their scoped regression work. They do not replace the Lab 4 integrated runner or final-main verification.

### Lab 4 backup and restore

Attachment storage defaults to `server/uploads/`; an optional absolute `UPLOAD_DIR` selects the isolated recovery root, as shown in `server/.env.example`.

Before applying Lab 4 to an established database, stop the API and other writers, record the deployed Git SHA and confirm the target database and attachment directory. Use PostgreSQL's `pg_dump` and `pg_restore` client tools. Supply `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD` from a protected environment or secret manager; do not put passwords in commands, scripts, or this repository.

Create a backup outside the checkout, then retain the database dump and matching `server/uploads/` tree together. The manifest hashes the original files before copying and checks the copied backup against those hashes; an empty upload directory is valid.

```powershell
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ROOT)) { throw 'BACKUP_ROOT is required.' }
$backupParent = [IO.Path]::GetFullPath($env:BACKUP_ROOT)
if (-not (Test-Path -LiteralPath $backupParent -PathType Container)) { throw 'BACKUP_ROOT must be an existing directory.' }
$repoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not identify the checkout.' }
$repoRoot = [IO.Path]::GetFullPath($repoRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
if ($backupParent.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $backupParent.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'BACKUP_ROOT must be outside the checkout.'
}
$sourceUploadRoot = if ([string]::IsNullOrWhiteSpace($env:UPLOAD_DIR)) { '.\server\uploads' } else { $env:UPLOAD_DIR }
$sourceUploadRoot = [IO.Path]::GetFullPath($sourceUploadRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not (Test-Path -LiteralPath $sourceUploadRoot -PathType Container)) { throw 'The source upload directory does not exist.' }
if ($backupParent.Equals($sourceUploadRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $backupParent.StartsWith($sourceUploadRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    $sourceUploadRoot.StartsWith($backupParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'BACKUP_ROOT and the source upload directory must not overlap.'
}
$backupRoot = Join-Path $backupParent ("toktickit-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
if (Test-Path -LiteralPath $backupRoot) { throw 'The backup destination already exists.' }
New-Item -ItemType Directory -Path $backupRoot | Out-Null
$sourceSha = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not record the source Git SHA.' }
Set-Content -LiteralPath (Join-Path $backupRoot "source-git-sha.txt") -Value $sourceSha
pg_dump --format=custom --no-owner --no-acl --file (Join-Path $backupRoot "database.dump") $env:PGDATABASE
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; do not use this backup.' }
$manifestPath = Join-Path $backupRoot "uploads-sha256.csv"
$sourceFiles = @(Get-ChildItem -LiteralPath $sourceUploadRoot -File -Force -Recurse | ForEach-Object {
  [pscustomobject]@{
    RelativePath = $_.FullName.Substring($sourceUploadRoot.Length).TrimStart('\')
    SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  }
})
if ($sourceFiles.Count -eq 0) {
  Set-Content -LiteralPath $manifestPath -Value 'RelativePath,SHA256'
} else {
  $sourceFiles | Export-Csv -NoTypeInformation -LiteralPath $manifestPath
}
$uploadRoot = Join-Path $backupRoot "uploads"
New-Item -ItemType Directory -Path $uploadRoot | Out-Null
Get-ChildItem -LiteralPath $sourceUploadRoot -File -Force -Recurse | ForEach-Object {
  $relativePath = $_.FullName.Substring($sourceUploadRoot.Length).TrimStart('\')
  $destinationPath = Join-Path $uploadRoot $relativePath
  $destinationDirectory = Split-Path -Parent $destinationPath
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $destinationPath
}
$copiedFiles = @(Get-ChildItem -LiteralPath $uploadRoot -File -Force -Recurse | ForEach-Object {
  [pscustomobject]@{
    RelativePath = $_.FullName.Substring($uploadRoot.Length).TrimStart('\')
    SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  }
})
if (Compare-Object -ReferenceObject $sourceFiles -DifferenceObject $copiedFiles -Property RelativePath, SHA256) {
  throw 'BACKUP_UPLOAD_COPY_MISMATCH: copied upload files differ from the original manifest.'
}
Write-Output "Backup created at $backupRoot"
```

Restore from a fresh PowerShell session into a new isolated PostgreSQL database and a separate application checkout. Set `BACKUP_ROOT` to the exact timestamped backup directory printed by the backup command, set the `PG*` variables to the restore destination, and set `UPLOAD_DIR` to a new absolute path. The script validates the dump, upload directory, and manifest (including all upload hashes) before it creates the database. Keep the original source database and backup intact:

```powershell
$ErrorActionPreference = 'Stop'
if ($env:PGDATABASE -notmatch '^toktickit_restore_[A-Za-z0-9_]+$') { throw 'PGDATABASE must name a new isolated toktickit_restore_* database.' }
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ROOT)) { throw 'Set BACKUP_ROOT to the exact existing backup directory.' }
$backupRoot = [IO.Path]::GetFullPath($env:BACKUP_ROOT)
if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) { throw 'RESTORE_BACKUP_INCOMPLETE: backup directory is missing.' }
$databaseDump = Join-Path $backupRoot 'database.dump'
$backupUploadRoot = Join-Path $backupRoot 'uploads'
$manifestPath = Join-Path $backupRoot 'uploads-sha256.csv'
if (-not (Test-Path -LiteralPath $databaseDump -PathType Leaf) -or (Get-Item -LiteralPath $databaseDump).Length -eq 0 -or
    -not (Test-Path -LiteralPath $backupUploadRoot -PathType Container) -or
    -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'RESTORE_BACKUP_INCOMPLETE: database.dump, uploads, and uploads-sha256.csv are required.'
}
$manifestHeader = (Get-Content -LiteralPath $manifestPath -TotalCount 1).Trim()
if ($manifestHeader -notmatch '^"?RelativePath"?,"?SHA256"?$') { throw 'RESTORE_BACKUP_INCOMPLETE: upload manifest header is invalid.' }
$expectedFiles = @(Import-Csv -LiteralPath $manifestPath)
if (@($expectedFiles | Where-Object { [string]::IsNullOrWhiteSpace($_.RelativePath) -or $_.SHA256 -notmatch '^[A-Fa-f0-9]{64}$' }).Count -gt 0) {
  throw 'RESTORE_BACKUP_INCOMPLETE: upload manifest entry is invalid.'
}
$backupFiles = @(Get-ChildItem -LiteralPath $backupUploadRoot -File -Force -Recurse | ForEach-Object {
  [pscustomobject]@{
    RelativePath = $_.FullName.Substring($backupUploadRoot.Length).TrimStart('\')
    SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  }
})
if (Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $backupFiles -Property RelativePath, SHA256) {
  throw 'RESTORE_BACKUP_MISMATCH: backup upload files do not match the manifest.'
}
if ([string]::IsNullOrWhiteSpace($env:UPLOAD_DIR) -or -not [IO.Path]::IsPathRooted($env:UPLOAD_DIR)) {
  throw 'UPLOAD_DIR must name a new absolute restore directory.'
}
$restoreUploadRoot = [IO.Path]::GetFullPath($env:UPLOAD_DIR)
if (-not $restoreUploadRoot.Equals($env:UPLOAD_DIR, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'UPLOAD_DIR must be a normalized absolute path.'
}
if (Test-Path -LiteralPath $restoreUploadRoot) { throw 'The restore upload directory already exists.' }
if ($restoreUploadRoot.Equals($backupRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $restoreUploadRoot.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    $backupRoot.StartsWith($restoreUploadRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The restore upload directory and backup must not overlap.'
}
createdb --template=template0 $env:PGDATABASE
if ($LASTEXITCODE -ne 0) { throw 'createdb failed; pg_restore was not run.' }
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname $env:PGDATABASE $databaseDump
if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed; do not direct application traffic to this database.' }
New-Item -ItemType Directory -Path $restoreUploadRoot | Out-Null
Get-ChildItem -LiteralPath $backupUploadRoot -File -Force -Recurse | ForEach-Object {
  $relativePath = $_.FullName.Substring($backupUploadRoot.Length).TrimStart('\')
  $destinationPath = Join-Path $restoreUploadRoot $relativePath
  $destinationDirectory = Split-Path -Parent $destinationPath
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $destinationPath
}
$actualFiles = @(Get-ChildItem -LiteralPath $restoreUploadRoot -File -Force -Recurse | ForEach-Object {
  [pscustomobject]@{
    RelativePath = $_.FullName.Substring($restoreUploadRoot.Length).TrimStart('\')
    SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  }
})
if (Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles -Property RelativePath, SHA256) {
  throw 'Restored upload inventory does not match the backup.'
}
```

Compare the restored upload files with `uploads-sha256.csv`, apply the matching application's migrations only in the isolated destination, and smoke-test login plus attachment metadata and download bytes before directing any application traffic there. Restore the database and matching file tree as one recovery point. Writes accepted after the backup are absent from that recovery point; never run an automatic down migration to try to recover them.

## API

Ticket and Attachment identity comes from the authenticated session cookie. The server reads the current User from that session and rejects ownership attempts based on client-provided identity fields. Browser mutations additionally require the session-bound `X-CSRF-Token` header; read-only requests use the session cookie without CSRF.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service health |
| GET | `/api/categories` | Active categories |
| GET | `/api/related-systems` | Active related systems |
| POST | `/api/auth/login` | Authenticate and establish the session cookie |
| GET | `/api/auth/me` | Return the authenticated User and CSRF token |
| POST | `/api/auth/logout` | Revoke the current session |
| POST | `/api/tickets` | Create a ticket |
| GET | `/api/tickets` | The caller's tickets, paginated, with search, filters and sorting |
| GET | `/api/tickets/:id` | One ticket the caller owns |
| POST | `/api/tickets/:id/attachments` | Upload an attachment (multipart, field `file`) |
| GET | `/api/attachments/:id` | Attachment metadata |
| GET | `/api/attachments/:id/download` | Download an active attachment |
| PATCH | `/api/attachments/:id/remove` | Soft-remove an attachment, with a reason |

Every non-2xx response has the shape `{ "error": { "code", "message", "details"? } }`. A ticket or attachment the caller does not own returns **404, not 403** — a 403 would confirm the resource exists and let one Requester enumerate another's ids. The full contract is in [docs/lab-02/api-spec.md](docs/lab-02/api-spec.md).

Attachments accept JPG, JPEG, PNG, WEBP and PDF up to 5 MB, with at most five active per ticket. Removal is soft: the row and the file both remain, and only access is revoked, so downloading a removed attachment returns 410.

## Documentation

| Document | Contents |
|---|---|
| [docs/lab-02/specification.md](docs/lab-02/specification.md) | Scope, functional requirements, business rules, data model, acceptance criteria, Definition of Done |
| [docs/lab-02/api-spec.md](docs/lab-02/api-spec.md) | Full API contract, status codes, error codes |
| [docs/lab-02/ui-spec.md](docs/lab-02/ui-spec.md) | Zen Green tokens, component states, responsive rules, visual checklist |
| [docs/lab-02/tests.md](docs/lab-02/tests.md) | Test plan, acceptance-criterion traceability, results |
| [docs/lab-02/reviewer.md](docs/lab-02/reviewer.md) | Peer review record |
| [docs/lab-02/ai-use.md](docs/lab-02/ai-use.md) | AI use and reflection |
| [docs/lab-03/specification.md](docs/lab-03/specification.md) | Lab 3 approved engineering contract and Definition of Done |
| [docs/lab-03/api-spec.md](docs/lab-03/api-spec.md) | Lab 3 authentication, authorization, ticket, and User Management API contract |
| [docs/lab-03/ui-spec.md](docs/lab-03/ui-spec.md) | Lab 3 Zen Green UI, responsive, and accessibility contract |
| [docs/lab-03/tests.md](docs/lab-03/tests.md) | Lab 3 test plan, traceability, integrated totals, and visual audit |
| [docs/lab-03/reviewer.md](docs/lab-03/reviewer.md) | Lab 3 GitHub review, PR, and Kanban record |
| [docs/lab-03/ai-use.md](docs/lab-03/ai-use.md) | Selected Lab 3 AI prompts, workflow, and student reflection |
| [docs/lab-04/specification.md](docs/lab-04/specification.md) | Lab 4 engineering contract and business rules |
| [docs/lab-04/api-spec.md](docs/lab-04/api-spec.md) | Lab 4 API contract |
| [docs/lab-04/ui-spec.md](docs/lab-04/ui-spec.md) | Lab 4 interface contract |
| [docs/lab-04/tests.md](docs/lab-04/tests.md) | Lab 4 verification plan and traceability |

## Project layout

```
server/     Express API, Prisma schema and migrations, server tests
client/     React + Vite frontend, component tests
e2e/        Playwright end-to-end tests and screenshot capture
docs/       Lab specifications and records
artifacts/  Screenshot evidence
```
