import { adSlotId, adsEnabled, adsenseClient } from "@/lib/ads";
import { AdUnit } from "@/components/shared/ad-unit";

export type AdPlacement = "home-secondary" | "archive-inline" | "leaderboard-secondary" | "results-footer";

const SIZES: Record<AdPlacement, string> = {
  "home-secondary": "min-h-[100px] sm:min-h-[90px]",
  "archive-inline": "min-h-[100px] sm:min-h-[90px]",
  "leaderboard-secondary": "min-h-[250px]",
  "results-footer": "min-h-[100px] sm:min-h-[90px]",
};

/**
 * Reserved, clearly labeled advertising slot. Renders nothing while advertising is disabled
 * (the default). With AdSense configured it shows one responsive unit; the min-height reserves
 * space to limit layout shift. Consent for EEA/UK visitors is handled by Google's own consent
 * message (AdSense → Privacy & messaging), which the same script loads. Never place
 * an AdSlot inside gameplay forms or between a guess input and its submit button.
 */
export function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  if (!adsEnabled()) return null;
  return (
    <aside aria-label="Advertisement" data-ad-placement={placement} className={`my-8 ${className}`}>
      <p className="mb-1 text-[11px] text-muted">Advertisement</p>
      <div className={`w-full overflow-hidden ${SIZES[placement]}`}>
        <AdUnit client={adsenseClient()!} slot={adSlotId()!} />
      </div>
    </aside>
  );
}
