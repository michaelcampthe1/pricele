/**
 * Grants or revokes the admin role. Uses the database OWNER connection (not pricele_app),
 * because role assignment is deliberately impossible through the application.
 *
 *   DATABASE_ADMIN_URL=postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres \
 *     npm run admin:bootstrap -- you@example.com     # first admin only; refuses if one exists
 *   npm run admin:grant  -- colleague@example.com    # additional admin (explicit)
 *   npm run admin:revoke -- colleague@example.com
 *
 * The user must already have signed up (and confirmed their email).
 */
import postgres from "postgres";

async function main() {
  const [command, email] = process.argv.slice(2);
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("Set DATABASE_ADMIN_URL to the database owner connection string.");
  if (!email || !["bootstrap", "grant", "revoke"].includes(command)) {
    throw new Error("Usage: admin-role.ts <bootstrap|grant|revoke> <email>");
  }
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname);
  const sql = postgres(url, { max: 1, ssl: isLocal ? false : "require", prepare: false, onnotice: () => {} });
  try {
    const [row] =
      command === "revoke"
        ? await sql`select pricele.revoke_admin(${email}) as r`
        : await sql`select pricele.bootstrap_admin(${email}, ${command === "grant"}) as r`;
    console.log(JSON.stringify(row.r));
    if (!row.r.ok) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
