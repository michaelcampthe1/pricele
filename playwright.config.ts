import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build backed by a LOCAL PostgreSQL database and a
 * test-only Supabase Auth stand-in (tests/e2e/support/auth-stub.mjs). To test against a real
 * Supabase project instead, point E2E_BASE_URL at a deployed preview and skip the web servers.
 */
const PORT = 3100;
const OWNER = "postgres://postgres:postgres@127.0.0.1:5432/pricele_e2e";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: chromiumPath
      ? { executablePath: chromiumPath, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] }
      : undefined,
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true }, testIgnore: /admin|responsive/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }, testMatch: /responsive|admin/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "npx tsx tests/e2e/support/prepare.ts && node tests/e2e/support/auth-stub.mjs",
          url: "http://127.0.0.1:54329/auth/v1/settings",
          env: { E2E_OWNER_URL: OWNER },
          timeout: 120_000,
          reuseExistingServer: false,
        },
        {
          command: `npx next build && npx next start -p ${PORT} -H 127.0.0.1`,
          url: `http://127.0.0.1:${PORT}/api/health`,
          timeout: 300_000,
          reuseExistingServer: false,
          env: {
            NEXT_DIST_DIR: ".next-e2e",
            NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_only_not_a_real_key",
            DATABASE_URL: "postgres://pricele_app:pricele_app_local_test@127.0.0.1:5432/pricele_e2e",
            CRON_SECRET: "e2e-cron-secret-0123456789",
          },
        },
      ],
});
