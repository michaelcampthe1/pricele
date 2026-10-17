import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { addDays, createLiveSet, createUser, makeAdmin, sql, today } from "../support/db";

config({ path: ".env.local", quiet: true });

export type E2EFixtures = {
  admin: { email: string; password: string; id: string };
  todayAnswers: [string, string, string];
  yesterday: string;
};

/** Fresh, known game state for the browser tests (local database only — see support/db.ts). */
export default async function globalSetup() {
  await sql("delete from private.rate_limits");
  const admin = await createUser("e2eadmin");
  await makeAdmin(admin.id);
  const todayAnswers: [string, string, string] = ["100.00", "27500.00", "4000000000.00"];
  await createLiveSet(admin.id, today(), todayAnswers);
  const yesterday = addDays(today(), -1);
  await createLiveSet(admin.id, yesterday, ["12.00", "3400.00", "560000000.00"]);
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const fixtures: E2EFixtures = { admin: { email: admin.email, password: admin.password, id: admin.id }, todayAnswers, yesterday };
  writeFileSync("tests/e2e/.auth/fixtures.json", JSON.stringify(fixtures));
}
