import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/lab-04/dashboard.performance.test.ts"],
    setupFiles: ["tests/lab-04/perfQueryEventSetup.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 300_000,
  },
});
