import { serverEnv } from "@/lib/env";

export type AdPlacement = "home-secondary" | "archive-inline" | "leaderboard-secondary" | "results-footer";

const SIZES: Record<AdPlacement, string> = {
  "home-secondary": "min-h-[100px] sm:min-h-[90px]",
  "archive-inline": "min-h-[100px] sm:min-h-[90px]",
  "leaderboard-secondary": "min-h-[250px]",
  "results-footer": "min-h-[100px] sm:min-h-[90px]",
};

function adsEnabled(): boolean {
  try {
    const env = serverEnv();
    return env.ADVERTISING_ENABLED === "true" && Boolean(env.AD_PROVIDER && env.AD_PUBLISHER_ID);
  } catch {
    return false;
  }
}

/**
 * Reserved, clearly labeled advertising slot. Renders nothing while advertising is disabled
 * (the default), so layouts stay clean. When a provider is configured, mount its approved
 * integration inside the reserved box (fixed min-height prevents layout shift). Never place
 * an AdSlot inside gameplay forms or between a guess input and its submit button.
 */
export function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  if (!adsEnabled()) return null;
  return (
    <aside aria-label="Advertisement" data-ad-placement={placement} className={`my-8 ${className}`}>
      <p className="mb-1 text-[11px] text-muted">Advertisement</p>
      <div className={`flex w-full items-center justify-center rounded-[10px] border border-line bg-sunk ${SIZES[placement]}`}>
        {/* Provider integration mounts here once configured and consent requirements are met. */}
      </div>
    </aside>
  );
}
