import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const OWNED_SCHEMA = /^issue91_verify_[a-f0-9]{24}$/;
const OWNED_PERF_SCHEMA = /^lab4_issue91_perf_[a-f0-9]{12}$/;
const REQUIRED_CONTAINER = "toktickit-lab4-issue85-test";

function databaseBaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error("Issue 91 requires an explicit isolated PostgreSQL DATABASE_URL.");
  const url = new URL(configured);
  const container = process.env.LAB4_PG_CONTAINER;
  if (url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/lab4test"
    || decodeURIComponent(url.username) !== "lab4test" || decodeURIComponent(url.password) !== "lab4test"
    || (container !== REQUIRED_CONTAINER && !/^[a-f0-9]{64}$/.test(container ?? ""))) {
    throw new Error("Issue 91 schema operations are restricted to the dedicated loopback lab4test PostgreSQL container.");
  }
  url.searchParams.delete("schema");
  url.hash = "";
  return url.toString();
}

function assertOwnedSchema(schema: string): void {
  if (!OWNED_SCHEMA.test(schema) && !OWNED_PERF_SCHEMA.test(schema)) {
    throw new Error(`Refusing to operate on a non-Issue91 schema: ${schema}`);
  }
}

async function main() {
  const action = process.argv[2];
  const admin = new PrismaClient({ datasources: { db: { url: databaseBaseUrl() } } });
  try {
    if (action === "create" || action === "create-perf") {
      const token = randomUUID().replaceAll("-", "");
      const schema = action === "create"
        ? `issue91_verify_${token.slice(0, 24)}`
        : `lab4_issue91_perf_${token.slice(0, 12)}`;
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      process.stdout.write(`${schema}\n`);
      return;
    }

    if (action === "drop") {
      const schema = process.argv[3];
      if (!schema) throw new Error("A task-owned schema argument is required.");
      assertOwnedSchema(schema);
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      const remaining = await admin.$queryRaw<Array<{ schema_name: string }>>`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}`;
      if (remaining.length !== 0) throw new Error(`Task-owned schema remains after cleanup: ${schema}`);
      process.stdout.write(`${schema} removed\n`);
      return;
    }

    throw new Error("usage: issue91-isolated-schema.ts create|create-perf|drop <owned-schema>");
  } finally {
    await admin.$disconnect();
  }
}

await main();
