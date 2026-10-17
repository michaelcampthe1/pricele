/** Builds a fresh local E2E database: shim + migrations + fictional sample seed + demo sets. */
import { spawnSync } from "node:child_process";

const env = { ...process.env, LOCAL_DATABASE_NAME: "pricele_e2e" };
for (const args of [["scripts/local-db.ts", "--reset"], ["scripts/demo-setup.ts"]]) {
  const r = spawnSync("npx", ["tsx", ...args], {
    stdio: "inherit",
    env: { ...env, LOCAL_OWNER_URL: "postgres://postgres:postgres@127.0.0.1:5432/pricele_e2e" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
