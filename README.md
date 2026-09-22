# TokTickIT

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and Network requests.

An authenticated Requester can create a ticket and receive an official ticket number, find their own tickets through search, filters, sorting and pagination, open a ticket, and upload, download and soft-remove attachments. Ownership is enforced by the backend: one Requester cannot read another's ticket or attachment.

Lab 3 authentication uses an eight-hour session cookie. The browser restores the current User through `/api/auth/me`; the server derives Ticket and Attachment ownership from that authenticated User and never from a client-supplied requester id. State-changing requests also send the session's `X-CSRF-Token` header.

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

The seed creates the four categories, seven related systems, active local Users, and the Lab 3 authentication fixtures used by the application and tests.

### Local seeded accounts

The seed uses local-only fixture credentials. These values are for a disposable development database only, never production credentials:

| Role | Example email | Seed password |
|---|---|---|
| Requester | `jennifer.anderson@kmutt.ac.th` | `TokTickIT123!` |
| IT Staff | `niran.support@kmutt.ac.th` | `TokTickIT123!` |
| Administrator | `kanya.admin@kmutt.ac.th` | `TokTickIT123!` |

Freshly seeded Users start in the mandatory-password-change flow. A migrated Lab 2 Requester receives the same local-only fixture input only when its legacy credential hash is missing; repeat seed/migration does not overwrite an established changed password.

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

Notes worth knowing before changing the test setup:

- Server test files run **sequentially** (`fileParallelism: false`). They share one development database, so parallel suites that create and mutate tickets interfere with each other.
- A global setup runs the seed once. It deliberately does **not** reset the database: the Lab 1 categories test asserts Category ids 1–4, and a truncate would restart the identity sequence.
- Each Lab 2 suite creates its own Requester rows with randomised emails and deletes only what it made, including any files it uploaded.
- `npx playwright test` runs both the end-to-end project and the screenshot capture. Use `npm run e2e` for the tests alone. Screenshot capture defaults to an ignored temporary root when invoked through `e2e/run-issue61.ps1`; use `-ScreenshotRoot artifacts/lab-03/screenshots` only when intentionally refreshing committed evidence.
- For the isolated Lab 3 verification used by Issues #61 and #81, first set an explicit local Docker `DATABASE_URL`, then run `powershell -ExecutionPolicy Bypass -File e2e/run-issue61-full.ps1 -ApiPort 3001 -ClientPort 5174`. The runner validates a public/unspecified base schema, creates and drops only task-owned PostgreSQL schemas, writes screenshots under ignored `test-results/`, and refuses to stop an unrelated process using a port.
- Use `powershell -ExecutionPolicy Bypass -File e2e/run-issue61.ps1 -Legacy -ApiPort 3001 -ClientPort 5174` for the authenticated legacy browser regression. Add `-Screenshots` for safe temporary screenshot verification, or explicitly add `-ScreenshotRoot artifacts/lab-03/screenshots` when a deliberate committed-artifact refresh is intended.

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

## Project layout

```
server/     Express API, Prisma schema and migrations, server tests
client/     React + Vite frontend, component tests
e2e/        Playwright end-to-end tests and screenshot capture
docs/       Lab specifications and records
artifacts/  Screenshot evidence
```
