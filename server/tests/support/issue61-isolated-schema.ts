import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const OWNED_SCHEMA_PATTERN = /^issue61_verify_[a-f0-9]{24}$/;

function baseDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error("DATABASE_URL is required");

  const url = new URL(configured);
  url.searchParams.delete("schema");
  return url.toString();
}

function assertOwnedSchema(schema: string): void {
  if (!OWNED_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Refusing to operate on non-task-owned schema: ${schema}`);
  }
}

async function main(): Promise<void> {
  const action = process.argv[2];
  const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl() } } });

  try {
    if (action === "create") {
      const schema = `issue61_verify_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      process.stdout.write(`${schema}\n`);
      return;
    }

    if (action === "drop") {
      const schema = process.argv[3];
      if (!schema) throw new Error("schema argument is required");
      assertOwnedSchema(schema);
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      process.stdout.write(`${schema}\n`);
      return;
    }

    if (action === "assert-clean") {
      const rows = await admin.$queryRaw<Array<{ schema_name: string }>>`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'issue61_verify_%'
        ORDER BY schema_name
      `;
      if (rows.length > 0) {
        throw new Error(`Task-owned schemas remain after cleanup: ${rows.map((row) => row.schema_name).join(", ")}`);
      }
      process.stdout.write("issue61_verify schemas remaining: 0\n");
      return;
    }

    throw new Error("usage: issue61-isolated-schema.ts create|drop <schema>|assert-clean");
  } finally {
    await admin.$disconnect();
  }
}

await main();
