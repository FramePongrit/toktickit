import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Every suite runs against one shared development database. Left parallel,
    // suites that create and mutate tickets interfere with each other.
    fileParallelism: false,
    globalSetup: "./tests/globalSetup.ts",
    hookTimeout: 30000,
  },
});
