import { ImageResponse } from "next/og";

// Admin link-preview thumbnail (shown when admin.kolis.ca is shared).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Kolis Admin";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#15131A", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 72, height: 72, background: "#E11D6B", color: "#fff", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 22, fontSize: 38, fontWeight: 800 }}>Ko</div>
          Kolis · Admin
        </div>
        <div style={{ fontSize: 74, fontWeight: 800, marginTop: 34, lineHeight: 1.05 }}>Operations console</div>
        <div style={{ fontSize: 30, opacity: 0.7, marginTop: 18 }}>Parcels · Organizations · Revenue · by Concord Express</div>
      </div>
    ),
    { ...size }
  );
}
