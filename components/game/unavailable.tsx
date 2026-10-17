import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { formatGameDate } from "@/lib/dates";
import { RetryButton } from "@/components/shared/retry-button";

export function GameUnavailable({ gameDate }: { gameDate: string }) {
  return (
    <EmptyState
      icon={<CalendarClock className="h-8 w-8" />}
      title="Today's game isn't ready yet"
      action={<ButtonLink href="/archive" variant="secondary">Play a past game</ButtonLink>}
    >
      The {formatGameDate(gameDate, "short")} questions haven&apos;t been published. Check back soon — your streak won&apos;t
      break for a day without a game. Past games are open in the archive.
    </EmptyState>
  );
}

export function LoadError({ what = "today's game" }: { what?: string }) {
  return (
    <EmptyState title={`We couldn't load ${what}`} action={<RetryButton />}>
      This is usually temporary. Your saved guesses and scores are safe.
    </EmptyState>
  );
}
