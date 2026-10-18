import { adsTxt } from "@/lib/ads";

export const dynamic = "force-dynamic";

export function GET() {
  const body = adsTxt();
  if (!body) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain" } });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
