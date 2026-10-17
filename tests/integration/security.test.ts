import { beforeAll, describe, expect, it } from "vitest";
import { addDays, anon, createLiveSet, createUser, makeAdmin, rpc, service, signedIn, today, uniqueFutureDate } from "../support/db";

let admin: { id: string };
let live: { setId: string; questionIds: string[] };
let future: { setId: string; questionIds: string[] };

beforeAll(async () => {
  admin = await createUser("admin");
  await makeAdmin(admin.id);
  live = await createLiveSet(admin.id, today());
  future = await createLiveSet(admin.id, addDays(today(), 3));
});

describe("answer-key confidentiality", () => {
  it("anonymous users cannot read answer keys, sources or attempts", async () => {
    const client = anon();
    for (const table of ["question_answers", "question_sources", "official_attempts", "guest_sessions", "user_roles", "question_corrections", "admin_audit_log", "daily_results", "practice_attempts", "feedback"] as const) {
      const { data, error } = await client.from(table).select("*").limit(5);
      expect(error, table).not.toBeNull();
      expect(data, table).toBeNull();
    }
  });

  it("signed-in players cannot read answer keys either", async () => {
    const user = await createUser();
    const client = await signedIn(user.email, user.password);
    const { data, error } = await client.from("question_answers").select("*").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
    const sources = await client.from("question_sources").select("*").limit(1);
    expect(sources.data).toBeNull();
  });

  it("public question rows expose no answer data and cannot be joined to answers", async () => {
    const { data, error } = await anon().from("questions").select("*").in("id", live.questionIds);
    // `*` includes columns the anon role has no privilege on, so the request is refused.
    expect(error).not.toBeNull();
    const ok = await anon().from("questions").select("id, prompt, context, difficulty").in("id", live.questionIds);
    expect(ok.data).toHaveLength(3);
    const joined = await anon().from("questions").select("id, question_answers(answer_amount)").in("id", live.questionIds);
    expect(joined.error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("future sets and their questions are invisible to the public", async () => {
    const sets = await anon().from("daily_sets").select("id").eq("id", future.setId);
    expect(sets.data).toEqual([]);
    const qs = await anon().from("questions").select("id, prompt").in("id", future.questionIds);
    expect(qs.data).toEqual([]);
    const membership = await anon().from("daily_set_questions").select("question_id").eq("daily_set_id", future.setId);
    expect(membership.data).toEqual([]);
  });

  it("draft questions are invisible to the public", async () => {
    const { data: q } = await service
      .from("questions")
      .insert({ prompt: "TEST draft question that is not live", difficulty: "easy", status: "draft" })
      .select("id")
      .single();
    const res = await anon().from("questions").select("id").eq("id", q!.id);
    expect(res.data).toEqual([]);
  });
});

describe("privileged functions", () => {
  it("API roles cannot execute submission, claim or admin functions", async () => {
    const user = await createUser();
    const client = await signedIn(user.email, user.password);
    const calls: [string, Record<string, unknown>][] = [
      ["submit_official_guess", { p_question_id: live.questionIds[0], p_guess: 1, p_user_id: user.id }],
      ["submit_practice_guess", { p_question_id: live.questionIds[0], p_guess: 1, p_user_id: user.id }],
      ["claim_guest_session", { p_guest_session_id: user.id, p_user_id: user.id }],
      ["admin_publish_daily_set", { p_admin_id: user.id, p_daily_set_id: live.setId, p_confirm_date: today() }],
      ["admin_correct_answer", { p_admin_id: admin.id, p_question_id: live.questionIds[0], p_new_answer: 1, p_reason: "hack attempt", p_source_url: "https://x.y", p_public_note: "" }],
      ["get_player_stats", { p_user_id: user.id }],
      ["check_rate_limit", { p_key: "x", p_limit: 1, p_window_seconds: 1 }],
      ["run_daily_maintenance", {}],
      ["pricele_score", { p_guess: 1, p_answer: 1 }],
    ];
    for (const [fn, args] of calls) {
      for (const c of [client, anon()]) {
        const { error } = await c.rpc(fn as never, args as never);
        expect(error, fn).not.toBeNull();
      }
    }
  });

  it("players cannot write attempts, results, roles or scores directly", async () => {
    const user = await createUser();
    const client = await signedIn(user.email, user.password);
    const attempt = await client.from("official_attempts").insert({
      daily_set_id: live.setId, question_id: live.questionIds[0], position: 1, user_id: user.id,
      guess_amount: 1, answer_snapshot: 1, score: 1000, absolute_percentage_error: 0, scoring_version: "x",
    });
    expect(attempt.error).not.toBeNull();
    const result = await client.from("daily_results").insert({
      daily_set_id: live.setId, game_date: today(), user_id: user.id, total_score: 3000, easy_score: 1000,
      medium_score: 1000, hard_score: 1000, perfect_guess_count: 3, completed_at: new Date().toISOString(),
    });
    expect(result.error).not.toBeNull();
    const role = await client.from("user_roles").insert({ user_id: user.id, role: "admin" });
    expect(role.error).not.toBeNull();
    const { data: roles } = await service.from("user_roles").select("*").eq("user_id", user.id);
    expect(roles).toEqual([]);
  });

  it("players can edit only permitted profile columns on their own profile", async () => {
    const user = await createUser();
    const other = await createUser();
    const client = await signedIn(user.email, user.password);

    const ok = await client.from("profiles").update({ display_name: "New Name" }).eq("id", user.id).select("display_name");
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ display_name: "New Name" }]);

    const suspend = await client.from("profiles").update({ suspended_at: null, username_confirmed: true } as never).eq("id", user.id);
    expect(suspend.error).not.toBeNull();

    const foreign = await client.from("profiles").update({ display_name: "Hacked" }).eq("id", other.id).select("id");
    expect(foreign.data).toEqual([]);
    const { data } = await service.from("profiles").select("display_name").eq("id", other.id).single();
    expect(data!.display_name).toBeNull();

    const reserved = await client.from("profiles").update({ username: "admin" }).eq("id", user.id);
    expect(reserved.error).not.toBeNull();
  });

  it("admin functions refuse non-admin actors even with service access", async () => {
    const user = await createUser();
    const date = uniqueFutureDate();
    const { data: s } = await service.from("daily_sets").insert({ game_date: date }).select("id").single();
    const { error } = await service.rpc("admin_publish_daily_set", { p_admin_id: user.id, p_daily_set_id: s!.id, p_confirm_date: date });
    expect(error?.message).toMatch(/forbidden/);
  });

  it("leaderboards are callable publicly and expose no private fields", async () => {
    const { data, error } = await anon().rpc("leaderboard_daily", { p_game_date: today() });
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(Object.keys(row)).not.toContain("user_id");
      expect(Object.keys(row)).not.toContain("email");
    }
  });
});

describe("profiles", () => {
  it("are provisioned with the requested username, or a generated one when taken/invalid", async () => {
    const a = await createUser("dup");
    const { data: pa } = await service.from("profiles").select("username, username_confirmed").eq("id", a.id).single();
    expect(pa!.username).toBe(a.username);
    expect(pa!.username_confirmed).toBe(true);

    const { data: b } = await service.auth.admin.createUser({
      email: `dup2-${Date.now()}@pricele.test`, password: "Passw0rd-xyz", email_confirm: true,
      user_metadata: { username: a.username },
    });
    const { data: pb } = await service.from("profiles").select("username, username_confirmed").eq("id", b.user!.id).single();
    expect(pb!.username).toMatch(/^player_[0-9a-f]{8}$/);
    expect(pb!.username_confirmed).toBe(false);
  });

  it("private profiles are hidden from the public", async () => {
    const user = await createUser();
    await service.from("profiles").update({ is_public: false }).eq("id", user.id);
    const { data } = await anon().from("profiles").select("username").eq("id", user.id);
    expect(data).toEqual([]);
  });
});

describe("scoring parity", () => {
  it("database formula matches the documented values", async () => {
    const cases: [string, string, number][] = [
      ["100", "100", 1000], ["200", "100", 591], ["50", "100", 591], ["1000", "100", 303], ["10", "100", 303],
    ];
    for (const [g, a, expected] of cases) {
      expect(await rpc<number>("pricele_score", { p_guess: g, p_answer: a })).toBe(expected);
    }
  });
});

describe("function privilege inventory", () => {
  it("only allow-listed functions are executable by PUBLIC, anon or authenticated", async () => {
    const { Client } = await import("pg");
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
    await db.connect();
    try {
      const { rows } = await db.query<{ fn: string; grantee: string }>(`
        select n.nspname || '.' || p.proname as fn,
               coalesce(r.rolname, 'PUBLIC') as grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        left join pg_roles r on r.oid = a.grantee
        where n.nspname in ('public', 'private')
          and a.privilege_type = 'EXECUTE'
          and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))`);
      const allowed = new Set([
        "public.leaderboard_daily", "public.leaderboard_weekly", "public.leaderboard_alltime",
        "private.current_game_date", "private.is_set_live", "private.is_question_live",
        "private.set_updated_at", "private.profiles_guard", "private.is_reserved_username",
      ]);
      const violations = rows.filter((r) => r.grantee === "PUBLIC" || !allowed.has(r.fn));
      expect(violations).toEqual([]);
      expect(rows.some((r) => r.fn === "public.submit_official_guess")).toBe(false);
    } finally {
      await db.end();
    }
  });
});
