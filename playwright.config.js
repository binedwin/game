import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3115",
    actionTimeout: 10000,
    channel: process.env.PW_BROWSER_CHANNEL || undefined,
    headless: true,
  },
  webServer: {
    command: "node server/index.js",
    env: { PORT: "3115" },
    url: "http://127.0.0.1:3115/health",
    reuseExistingServer: false,
  },
});
