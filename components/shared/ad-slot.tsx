import { serverEnv } from "@/lib/env.server";
import { cn } from "@/lib/cn";

export type AdPlacement = "home-secondary" | "archive-inline" | "leaderboard-secondary" | "results-footer";

const HEIGHTS: Record<AdPlacement, string> = {
  "home-secondary": "min-h-[100px] sm:min-h-[120px]",
  "archive-inline": "min-h-[100px]",
  "leaderboard-secondary": "min-h-[250px]",
  "results-footer": "min-h-[100px]",
};

/**
 * Reserved advertising placement. Disabled by default (renders nothing, so layouts stay clean).
 *
 * When ADVERTISING_ENABLED=true and AD_PROVIDER/AD_PUBLISHER_ID are set, a fixed-height,
 * clearly labeled container is reserved so a provider can fill it without layout shift. No ad
 * network script ships with Pricele: integrate the provider's approved snippet here, behind a
 * consent mechanism where required. Never place AdSlot inside gameplay (/play) or between a
 * question input and its submit control.
 */
export function AdSlot({ placement, className }: { placement: AdPlacement; className?: string }) {
  const env = serverEnv();
  if (!env.advertisingEnabled || !env.adProvider || !env.adPublisherId) return null;
  return (
    <aside
      aria-label="Advertisement"
      data-ad-placement={placement}
      data-ad-provider={env.adProvider}
      className={cn("flex w-full flex-col items-center justify-center rounded-[var(--radius)] border border-border bg-surface-muted/50", HEIGHTS[placement], className)}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted">Advertisement</span>
    </aside>
  );
}
