import { defineConfig } from "@playwright/test";
const port = process.env.TEST_PORT || "3105";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 180000,
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : "chromium"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  globalSetup: "./tests/helpers/global-setup.mjs",
  reporter: [["list"], ["html", { open: "never" }]],
});
