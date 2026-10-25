import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/lab-03/migration-seed.regression.test.ts",
      "tests/lab-04/migration.regression.test.ts",
      "tests/lab-04/recovery.integration.test.ts",
      "tests/lab-04/backup-runbook.test.ts",
    ],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
