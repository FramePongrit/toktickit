import { execSync } from "node:child_process";

/**
 * Runs once before any suite. The seed is idempotent, so this only guarantees
 * that the reference data every suite depends on — the four categories, the
 * related systems, and the seeded requesters — is present.
 *
 * It deliberately does not reset the database: tests/lab-01/categories.test.ts
 * asserts Category ids 1..4, and a truncate would restart the identity
 * sequence and break a graded Lab 1 test.
 */
export default function globalSetup() {
  execSync("npx prisma db seed", { stdio: "inherit" });
}
