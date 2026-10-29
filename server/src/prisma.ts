import { PrismaClient } from "@prisma/client";

// Lazy singleton: the client is created on first use, not at import time.
// This keeps route modules and tests that don't touch the DB (e.g. /api/health)
// free of database side effects.
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient(process.env.PRISMA_QUERY_EVENTS === "1"
    ? { log: [{ emit: "event", level: "query" }] }
    : undefined);
  return client;
}
