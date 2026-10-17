import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export function GameUnavailable() {
  return (
    <EmptyState
      icon={<CalendarClock className="size-8" aria-hidden />}
      title="Today's game isn't ready yet"
      action={<ButtonLink href="/archive" variant="secondary">Play a past game</ButtonLink>}
    >
      The next set of questions hasn&apos;t been published. Check back soon — in the meantime, the archive has every previous game.
    </EmptyState>
  );
}

export function SampleBanner() {
  return (
    <p className="rounded-[var(--radius)] border border-warning/25 bg-warning-soft px-3 py-2 text-sm text-warning">
      <span className="font-semibold">Sample content.</span> This game uses development placeholder questions with unverified values.
    </p>
  );
}
