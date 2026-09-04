# TokTickIT

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and Network requests.

As of Lab 2 a Requester can select a development identity, create a ticket and receive an official ticket number, find their own tickets through search, filters, sorting and pagination, open a ticket, and upload, download and soft-remove attachments. Ownership is enforced by the backend: one Requester cannot read another's ticket or attachment.

Authentication arrives in Lab 3. Until then the **Development Requester Selector is a testing mechanism, not a login screen**, and the identity it supplies is trusted without verification.

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

The seed creates the four categories, seven related systems, four active Development Requesters and one inactive one. The inactive Requester is excluded from the selector by the API, which is asserted by a test.

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
- `npx playwright test` runs both the end-to-end project and the screenshot capture. Use `npm run e2e` for the tests alone, or `npm run screenshots` to refresh the committed evidence in `artifacts/lab-02/screenshots/`.

## API

Identity travels in the `X-Requester-Id` header on every ticket and attachment endpoint. The three reference-data endpoints do not require it, because the selection screen must work before a Requester has been chosen.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service health |
| GET | `/api/categories` | Active categories |
| GET | `/api/related-systems` | Active related systems |
| GET | `/api/dev-requesters` | Active development requesters |
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

## Project layout

```
server/     Express API, Prisma schema and migrations, server tests
client/     React + Vite frontend, component tests
e2e/        Playwright end-to-end tests and screenshot capture
docs/       Lab specifications and records
artifacts/  Screenshot evidence
```
