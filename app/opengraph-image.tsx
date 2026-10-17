import { ImageResponse } from "next/og";

export const alt = "Pricele — the daily price-guessing game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#fafaf7", color: "#1c211e" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44, fontWeight: 700 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#1d7348" }} />
          Pricele
        </div>
        <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02, marginTop: 40, maxWidth: 900 }}>
          Think you know what things cost?
        </div>
        <div style={{ fontSize: 34, color: "#5d655f", marginTop: 30 }}>Three questions. Three difficulty levels. One new challenge every day.</div>
      </div>
    ),
    size,
  );
}
