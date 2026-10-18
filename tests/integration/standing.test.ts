import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { createAdmin, createUser, guestToken, playSet, publishSet } from "../db/fixtures";

let db: TestDb;
let adminId: string;
let svc: typeof import("@/lib/game/service");

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.appUrl;
  svc = await import("@/lib/game/service");
  adminId = await createAdmin(db);
});

afterAll(async () => {
  await db?.drop();
});

describe("daily standing", () => {
  const date = "2026-10-16";
  let qids: [string, string, string];

  beforeAll(async () => {
    ({ questionIds: qids } = await publishSet(db, adminId, date, ["100.00", "25000.00", "4000000000.00"]));
  });

  it("ranks accounts and guests together, and ignores players who haven't finished", async () => {
    const best = await createUser(db);
    await playSet(best, null, qids, ["100", "25000", "4000000000"]); // 3,000

    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    const guest = { userId: null, guestHash: g.hash };
    await playSet(null, g.hash, qids, ["200", "25000", "4000000000"]); // second

    const worst = await createUser(db);
    await playSet(worst, null, qids, ["1", "1", "1"]);

    const unfinished = await createUser(db);
    await playSet(unfinished, null, qids.slice(0, 2), ["100", "25000"]);

    expect(await svc.getDailyStanding({ userId: best, guestHash: null }, date)).toEqual({ rank: 1, participants: 3, beaten: 2 });
    expect(await svc.getDailyStanding(guest, date)).toEqual({ rank: 2, participants: 3, beaten: 1 });
    expect(await svc.getDailyStanding({ userId: worst, guestHash: null }, date)).toEqual({ rank: 3, participants: 3, beaten: 0 });
    expect(await svc.getDailyStanding({ userId: unfinished, guestHash: null }, date)).toBeNull();
    expect(await svc.getDailyStanding({ userId: null, guestHash: guestToken().hash }, date)).toBeNull();
  });
});
