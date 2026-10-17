import { ImageResponse } from "next/og";

export const alt = "Pricele — think you know what things cost?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#faf8f4", color: "#1c1b18" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "#1b7349", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 44, fontWeight: 700 }}>$</div>
          <div style={{ fontSize: 52, fontWeight: 700 }}>Pricele</div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 48, letterSpacing: -2, lineHeight: 1.05 }}>Think you know what things cost?</div>
        <div style={{ fontSize: 34, marginTop: 28, color: "#67635b" }}>Three questions. Three difficulty levels. One new challenge every day.</div>
      </div>
    ),
    size,
  );
}
