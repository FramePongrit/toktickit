import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/lab-03/auth-security.unit.test.ts"],
    fileParallelism: false,
  },
});
