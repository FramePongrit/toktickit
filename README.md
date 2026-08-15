# TokTickIT 

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and Network requests.

## Setup Instructions

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)

### 2. Database Setup
1. Ensure PostgreSQL is running on your local machine.
2. Create a database named `toktickit` (or use the credentials specified in your `server/.env` file).

### 3. Server Setup
```bash
cd server
npm install
# Copy .env.example to .env and configure DATABASE_URL
cp .env.example .env
# Initialize the database (this will run migrations and seed data once set up)
npx prisma generate
```

### 4. Client Setup
```bash
cd client
npm install
# Copy .env.example to .env
cp .env.example .env
```

### 5. Running the Application
Open two terminal windows:

**Terminal 1 (Server):**
```bash
cd server
npm run dev
```

**Terminal 2 (Client):**
```bash
cd client
npm run dev
```

### Testing
Run `npm test` in the respective `client` and `server` directories to run the Vitest and Supertest test suites.