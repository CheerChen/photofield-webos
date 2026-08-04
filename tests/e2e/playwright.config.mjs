// tests/e2e/playwright.config.mjs
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: "node server.mjs",
    port: 4174,
    reuseExistingServer: !process.env.CI,
  },
});
