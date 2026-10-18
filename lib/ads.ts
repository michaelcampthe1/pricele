/**
 * Google AdSense configuration, read straight from the environment so it never depends on the
 * database settings being valid.
 *
 * - Publisher id (lib/site.ts, or AD_PUBLISHER_ID to override): when valid, the site publishes
 *   /ads.txt and the google-adsense-account meta tag, which Google uses to verify the site.
 * - ADVERTISING_ENABLED=true plus AD_SLOT_ID (a display ad unit id, digits only): ads render in
 *   the reserved slots. Gameplay pages never show ads.
 */
import { ADSENSE_PUBLISHER_ID } from "@/lib/site";

const PUB = /^(?:ca-)?(pub-\d{10,20})$/;
const SLOT = /^\d{6,20}$/;

/** "ca-pub-…" client id, or null when not configured / malformed. */
export function adsenseClient(): string | null {
  const m = PUB.exec((process.env.AD_PUBLISHER_ID || ADSENSE_PUBLISHER_ID).trim());
  return m ? `ca-${m[1]}` : null;
}

export function adSlotId(): string | null {
  const v = (process.env.AD_SLOT_ID ?? "").trim();
  return SLOT.test(v) ? v : null;
}

export function adsEnabled(): boolean {
  return process.env.ADVERTISING_ENABLED === "true" && adsenseClient() !== null && adSlotId() !== null;
}

/** Contents of /ads.txt for the configured publisher (Google's published certification id). */
export function adsTxt(): string | null {
  const client = adsenseClient();
  return client ? `google.com, ${client.slice(3)}, DIRECT, f08c47fec0942fa0\n` : null;
}
