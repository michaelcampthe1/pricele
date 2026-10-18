import { afterEach, describe, expect, it } from "vitest";
import { adSlotId, adsEnabled, adsTxt, adsenseClient } from "@/lib/ads";

const keys = ["AD_PUBLISHER_ID", "AD_SLOT_ID", "ADVERTISING_ENABLED"] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("AdSense configuration", () => {
  it("verifies with the site's publisher id but shows no ads by default", () => {
    for (const k of keys) delete process.env[k];
    expect(adsenseClient()).toBe("ca-pub-5161455847685842");
    expect(adsTxt()).toBe("google.com, pub-5161455847685842, DIRECT, f08c47fec0942fa0\n");
    expect(adsEnabled()).toBe(false);
  });

  it("accepts ca-pub- and pub- forms and builds ads.txt", () => {
    process.env.AD_PUBLISHER_ID = " pub-1234567890123456 ";
    expect(adsenseClient()).toBe("ca-pub-1234567890123456");
    process.env.AD_PUBLISHER_ID = "ca-pub-1234567890123456";
    expect(adsTxt()).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("rejects malformed ids", () => {
    process.env.AD_PUBLISHER_ID = "ca-pub-12<script>";
    expect(adsenseClient()).toBeNull();
    process.env.AD_SLOT_ID = "12a";
    expect(adSlotId()).toBeNull();
  });

  it("shows ads only when enabled with both ids", () => {
    process.env.AD_PUBLISHER_ID = "ca-pub-1234567890123456";
    process.env.AD_SLOT_ID = "1234567890";
    process.env.ADVERTISING_ENABLED = "false";
    expect(adsEnabled()).toBe(false);
    process.env.ADVERTISING_ENABLED = "true";
    expect(adsEnabled()).toBe(true);
    delete process.env.AD_SLOT_ID;
    expect(adsEnabled()).toBe(false);
  });
});
