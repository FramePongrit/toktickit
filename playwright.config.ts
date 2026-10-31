import { defineConfig, devices } from "@playwright/test";

const CLIENT_URL = process.env.PW_CLIENT_URL ?? "http://localhost:5173";
const API_URL = process.env.PW_API_URL ?? "http://localhost:3000";
const API_PORT = new URL(API_URL).port || "3000";
const CLIENT_PORT = process.env.PW_CLIENT_PORT ?? (new URL(CLIENT_URL).port || "5173");
const CLIENT_HOST = new URL(CLIENT_URL).hostname;
const OUTPUT_DIR = process.env.PW_OUTPUT_DIR ?? "test-results/playwright";
const HTML_REPORT_DIR = process.env.PW_HTML_REPORT_DIR ?? "playwright-report";
const reuseExistingServer = process.env.PW_REUSE_SERVER === "true";
const issue90DashboardOptIn = process.env.PW_RUN_ISSUE90_E2E === "true";

export default defineConfig({
  testDir: "./e2e",
  outputDir: OUTPUT_DIR,
  // These run against one shared database and create real tickets, so parallel
  // workers would interfere the same way the server suites would.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: HTML_REPORT_DIR, open: "never" }]],

  use: {
    baseURL: CLIENT_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      testIgnore: issue90DashboardOptIn ? [] : ["**/lab-04/dashboards.spec.ts"],
      grepInvert: /@screenshots/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Existing Lab 2/3 capture flows remain isolated from normal E2E runs.
      name: "screenshots",
      testMatch: /.*\.screens\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Lab 4 Dashboard captures are opt-in and run independently from the
      // lifecycle E2E cases so each project has a single clear responsibility.
      name: "dashboard-screenshots",
      testMatch: /.*lab-04\/dashboards\.spec\.ts/,
      testIgnore: issue90DashboardOptIn ? [] : ["**/lab-04/dashboards.spec.ts"],
      grep: /@screenshots/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Playwright starts both servers and waits for them. reuseExistingServer
  // means a dev server already running locally is used as-is.
  webServer: [
    {
      command: "node --import tsx/esm src/index.ts",
      cwd: "server",
      url: `${API_URL}/api/health`,
      reuseExistingServer,
      timeout: 60_000,
      stdout: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      env: {
        NODE_ENV: "local",
        JWT_SECRET: "local-e2e-only-jwt-secret-change-me-32chars",
        PORT: API_PORT,
        CLIENT_ORIGIN: CLIENT_URL,
        COOKIE_SECURE: "false",
      },
    },
    {
      command: `node node_modules/vite/bin/vite.js --host ${CLIENT_HOST} --port ${CLIENT_PORT} --strictPort`,
      cwd: "client",
      url: CLIENT_URL,
      reuseExistingServer,
      timeout: 60_000,
      stdout: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      env: { VITE_API_URL: API_URL },
    },
  ],
});
