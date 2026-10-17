import "server-only";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { readGuestHash } from "@/lib/auth/guest";
import { getProfile, type PlayerRef } from "@/lib/game/service";
import type { Profile } from "@/lib/game/types";

export type Viewer = {
  player: PlayerRef;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  isGuest: boolean;
};

/** Resolves who is making this request: a signed-in player, a guest, or nobody yet. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await getSessionUser();
  if (user) {
    const profile = await getProfile(user.id);
    if (profile) {
      return { player: { userId: user.id, guestHash: null }, user, profile, isGuest: false };
    }
  }
  const guestHash = await readGuestHash();
  return { player: { userId: null, guestHash }, user: null, profile: null, isGuest: true };
});
