import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Player } from "./identity";

export type ArchivePlayerSummary = {
  officialAnswered: number;
  officialPoints: number;
  practiceAnswered: number;
  practicePoints: number;
};

/** The player's official and practice activity for a page of archive sets (two queries). */
export async function getArchiveSummaries(player: Player, setIds: string[]): Promise<Map<string, ArchivePlayerSummary>> {
  const out = new Map<string, ArchivePlayerSummary>();
  if (player.kind === "anonymous" || setIds.length === 0) return out;
  const [column, value] = player.kind === "user" ? ["user_id", player.userId] : ["guest_session_id", player.guestSessionId];
  const svc = createServiceClient();
  const [official, practice] = await Promise.all([
    svc.from("official_attempts").select("daily_set_id, score, voided").in("daily_set_id", setIds).eq(column, value),
    svc.from("practice_attempts").select("daily_set_id, score").in("daily_set_id", setIds).eq(column, value),
  ]);
  const get = (id: string) => {
    if (!out.has(id)) out.set(id, { officialAnswered: 0, officialPoints: 0, practiceAnswered: 0, practicePoints: 0 });
    return out.get(id)!;
  };
  for (const a of official.data ?? []) {
    if (a.voided) continue;
    const s = get(a.daily_set_id);
    s.officialAnswered += 1;
    s.officialPoints += a.score;
  }
  for (const a of practice.data ?? []) {
    const s = get(a.daily_set_id);
    s.practiceAnswered += 1;
    s.practicePoints += a.score;
  }
  return out;
}
