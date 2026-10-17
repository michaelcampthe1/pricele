import "server-only";
import { getGameDate } from "@/lib/dates";
import { currentPlayer } from "./identity";
import { getLiveSet, getOfficialResults, summarize } from "./queries";

/** Today's set (Eastern Time, server clock) plus the current player's stored progress. */
export async function loadToday() {
  const gameDate = getGameDate();
  const [set, player] = await Promise.all([getLiveSet(gameDate), currentPlayer()]);
  if (!set) return { gameDate, set: null, player, results: new Map(), summary: null } as const;
  const results = await getOfficialResults(player, set);
  return { gameDate, set, player, results, summary: summarize(set, results) } as const;
}
