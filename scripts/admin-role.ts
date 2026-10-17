/**
 * Grant or revoke the Pricele administrator role. Server-side, one-off, idempotent.
 *
 *   npm run admin:grant  -- operator@example.com     (or set ADMIN_BOOTSTRAP_EMAIL)
 *   npm run admin:revoke -- operator@example.com
 *   npm run admin:list
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 * The user must already have signed up and confirmed their email. Nothing in the web app
 * can grant roles; signing up never grants admin.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

const [command, emailArg] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function findUser(email: string) {
  for (let page = 1; page < 1000; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function main() {
  if (command === "list") {
    const { data, error } = await db.from("user_roles").select("user_id, role, created_at").eq("role", "admin");
    if (error) throw error;
    for (const r of data) {
      const { data: u } = await db.auth.admin.getUserById(r.user_id);
      console.log(`${u.user?.email ?? r.user_id}  (since ${r.created_at})`);
    }
    if (data.length === 0) console.log("No administrators.");
    return;
  }
  const email = emailArg ?? process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!email || (command !== "grant" && command !== "revoke")) {
    console.error("Usage: admin-role.ts grant|revoke <email> | list");
    process.exit(1);
  }
  const user = await findUser(email);
  if (!user) {
    console.error(`No account for ${email}. Sign up on the site first.`);
    process.exit(1);
  }
  if (command === "grant") {
    if (!user.email_confirmed_at) {
      console.error(`${email} hasn't confirmed their email yet. Confirm it before granting admin.`);
      process.exit(1);
    }
    const { error } = await db.from("user_roles").upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (error) throw error;
    await db.from("admin_audit_log").insert({ admin_user_id: null, action: "role.grant_admin", entity_type: "user", entity_id: user.id, details: { via: "script" } });
    console.log(`${email} is an administrator.`);
  } else {
    const { error } = await db.from("user_roles").delete().eq("user_id", user.id).eq("role", "admin");
    if (error) throw error;
    await db.from("admin_audit_log").insert({ admin_user_id: null, action: "role.revoke_admin", entity_type: "user", entity_id: user.id, details: { via: "script" } });
    console.log(`${email} is no longer an administrator.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
