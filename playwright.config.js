import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  workers: 1,
  globalSetup: "./tests/browser/setup.js",
  use: {
    actionTimeout: 10000,
    channel: process.env.PW_BROWSER_CHANNEL || undefined,
    headless: true,
  },
});
