import "server-only";
import { getAuthUser } from "@/lib/auth/session";
import { getGuestSession, getOrCreateGuestSession } from "@/lib/security/guest";
import { clientKey } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";

export type Player =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestSessionId: string }
  | { kind: "anonymous" };

/** Who is playing, for reads. Signed-in users always take precedence over a guest cookie. */
export async function currentPlayer(): Promise<Player> {
  const user = await getAuthUser();
  if (user) return { kind: "user", userId: user.id };
  const guest = await getGuestSession();
  if (guest) return { kind: "guest", guestSessionId: guest.id };
  return { kind: "anonymous" };
}

/** Who is playing, for writes: issues a guest session when needed (rate limited). */
export async function playerForWrite(): Promise<Exclude<Player, { kind: "anonymous" }> | "rate_limited"> {
  const player = await currentPlayer();
  if (player.kind !== "anonymous") return player;
  if (!(await rateLimit("guestCreate", await clientKey()))) return "rate_limited";
  const guest = await getOrCreateGuestSession();
  return { kind: "guest", guestSessionId: guest.id };
}

export function playerSubject(player: Exclude<Player, { kind: "anonymous" }>): string {
  return player.kind === "user" ? `u:${player.userId}` : `g:${player.guestSessionId}`;
}

export function rpcIdentity(player: Exclude<Player, { kind: "anonymous" }>) {
  return player.kind === "user"
    ? { p_user_id: player.userId }
    : { p_guest_session_id: player.guestSessionId };
}
