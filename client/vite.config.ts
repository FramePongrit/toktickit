import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    // Was .test.tsx only, which silently skipped any .test.ts file — it would
    // report as passing while never having run.
    include: ["tests/**/*.test.{ts,tsx}"],
    // Suites spy on API modules with vi.spyOn. Without this the spies leak
    // between tests and produce order-dependent failures that look like
    // component bugs.
    restoreMocks: true,
  },
});
