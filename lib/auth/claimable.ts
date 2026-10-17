import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getGuestSession } from "@/lib/security/guest";

/** Summary of unclaimed guest progress on this browser (for showing a claim prompt). */
export async function getClaimableGuestProgress(): Promise<{ attempts: number; days: number } | null> {
  const guest = await getGuestSession();
  if (!guest) return null;
  const { data } = await createServiceClient()
    .from("official_attempts")
    .select("daily_set_id")
    .eq("guest_session_id", guest.id);
  if (!data || data.length === 0) return null;
  return { attempts: data.length, days: new Set(data.map((d) => d.daily_set_id)).size };
}
