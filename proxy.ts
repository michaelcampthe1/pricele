import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session cookie on navigation (per Supabase SSR guidance)
 * and attaches a request correlation id. Authorization is NOT decided here: every page,
 * server action and route re-checks identity and roles on the server.
 */
export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

  if (url && key && hasAuthCookie) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });
    try {
      await supabase.auth.getClaims();
    } catch {
      // Auth service unreachable: continue as signed-out; pages handle it.
    }
  }

  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|fonts/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|woff2)$).*)"],
};
