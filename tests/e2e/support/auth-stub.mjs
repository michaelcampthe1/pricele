/**
 * TEST-ONLY Supabase Auth (GoTrue) stand-in for end-to-end tests in environments where the
 * real Supabase stack can't run. Implements just the endpoints @supabase/supabase-js uses for
 * email/password: signup (auto-confirm), password grant, refresh grant, user, logout.
 * Users are written to auth.users in the LOCAL test database so Pricele's profile trigger runs.
 * Never deploy this. Production uses real Supabase Auth.
 */
import http from "node:http";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

const PORT = Number(process.env.AUTH_STUB_PORT ?? 54329);
const OWNER_URL = process.env.E2E_OWNER_URL;
const SECRET = "e2e-only-jwt-secret";
if (!OWNER_URL || !/127\.0\.0\.1|localhost/.test(OWNER_URL)) throw new Error("auth stub requires a local E2E_OWNER_URL");

const sql = postgres(OWNER_URL, { max: 2, onnotice: () => {} });
const refreshTokens = new Map(); // token -> userId
const revoked = new Set(); // session ids

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const hashPw = (pw) => createHash("sha256").update(`stub:${pw}`).digest("hex");

function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

function verify(token) {
  const [h, b, s] = String(token).split(".");
  if (!h || !b || !s) return null;
  const expected = createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (expected !== s) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString());
  if (payload.exp * 1000 < Date.now() || revoked.has(payload.session_id)) return null;
  return payload;
}

function userJson(u) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.created_at,
    phone: "",
    confirmed_at: u.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [{ id: u.id, user_id: u.id, provider: "email", identity_data: { email: u.email, sub: u.id } }],
    created_at: u.created_at,
    updated_at: u.created_at,
    is_anonymous: false,
  };
}

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const sid = randomUUID();
  const access = sign({
    sub: u.id,
    email: u.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
    session_id: sid,
    aal: "aal1",
    app_metadata: { provider: "email" },
    user_metadata: u.raw_user_meta_data ?? {},
  });
  const refresh = randomBytes(24).toString("hex");
  refreshTokens.set(refresh, u.id);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(u) };
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(data === undefined ? "" : JSON.stringify(data));
}

const err = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const path = url.pathname.replace(/^\/auth\/v1/, "");
    if (req.method === "OPTIONS") return send(res, 204);

    if (req.method === "POST" && path === "/signup") {
      const { email, password, data } = await body(req);
      if (!email || !password) return err(res, 400, "validation_failed", "missing email or password");
      if (String(password).length < 6) return err(res, 422, "weak_password", "weak password");
      const existing = await sql`select * from auth.users where lower(email) = lower(${email})`;
      if (existing.length) return err(res, 422, "user_already_exists", "User already registered");
      const [u] = await sql`
        insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
        values (${email}, ${hashPw(password)}, now(), ${sql.json(data ?? {})}) returning *`;
      return send(res, 200, session(u));
    }

    if (req.method === "POST" && path === "/token") {
      const grant = url.searchParams.get("grant_type");
      const b = await body(req);
      if (grant === "password") {
        const [u] = await sql`select * from auth.users where lower(email) = lower(${b.email ?? ""})`;
        if (!u || u.encrypted_password !== hashPw(b.password ?? "")) {
          return err(res, 400, "invalid_credentials", "Invalid login credentials");
        }
        return send(res, 200, session(u));
      }
      if (grant === "refresh_token") {
        const id = refreshTokens.get(b.refresh_token);
        if (!id) return err(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
        refreshTokens.delete(b.refresh_token);
        const [u] = await sql`select * from auth.users where id = ${id}`;
        if (!u) return err(res, 400, "user_not_found", "User not found");
        return send(res, 200, session(u));
      }
      return err(res, 400, "unsupported_grant_type", "unsupported grant");
    }

    if (path === "/user") {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const claims = verify(token);
      if (!claims) return err(res, 401, "bad_jwt", "invalid JWT");
      const [u] = await sql`select * from auth.users where id = ${claims.sub}`;
      if (!u) return err(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
      return send(res, 200, userJson(u));
    }

    if (req.method === "POST" && path === "/logout") {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const claims = verify(token);
      if (claims) revoked.add(claims.session_id);
      return send(res, 204);
    }

    if (req.method === "POST" && path === "/recover") return send(res, 200, {});
    if (path === "/settings") return send(res, 200, { external: { email: true, google: false }, mailer_autoconfirm: true });
    return err(res, 404, "not_found", `stub does not implement ${req.method} ${path}`);
  } catch (e) {
    console.error("auth-stub error", e);
    return err(res, 500, "unexpected_failure", "stub failure");
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`auth stub listening on ${PORT}`));
