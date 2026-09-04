import { defineConfig, devices } from "@playwright/test";

const CLIENT_URL = "http://localhost:5173";
const API_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // These run against one shared database and create real tickets, so parallel
  // workers would interfere the same way the server suites would.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: CLIENT_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Capture only; kept separate so `npm run e2e` does not rewrite the
      // committed evidence on every run.
      name: "screenshots",
      testMatch: /.*\.screens\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Playwright starts both servers and waits for them. reuseExistingServer
  // means a dev server already running locally is used as-is.
  webServer: [
    {
      command: "npm run dev --prefix server",
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
    {
      command: "npm run dev --prefix client",
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
  ],
});
