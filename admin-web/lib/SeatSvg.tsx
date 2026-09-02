"use client";
// The seat, ported from the LoadQ app's components/SeatSvg.tsx.
//
// Same five rectangles, same viewBox, same states — headrest, two armrests,
// backrest, base. Deliberately identical so a seat on the tablet sheet reads as
// the same object a driver taps in the app. If the app's shape changes, change
// this to match; two seat drawings that drift is worse than one plain circle.
//
// The app's palette sits on a dark background (border #3D2E00 is nearly black),
// so the empty-seat outline is lightened here for a white sheet. Filled keeps
// the LoadQ accent.

export type SeatState = "empty" | "filled" | "locked" | "disputed";

const C = {
  accent: "#FF6B00",   // Colors.accent — a taken seat
  yellow: "#F5C842",   // Colors.yellow — held/locked
  red: "#DC2626",      // Colors.red    — disputed
  empty: "#D6CFC3",    // lightened from Colors.border for a light background
};

export default function SeatSvg({
  state = "empty", size = 30, onClick, title,
}: { state?: SeatState; size?: number; onClick?: () => void; title?: string }) {
  const filled = state === "filled" || state === "locked" || state === "disputed";
  const c = state === "disputed" ? C.red : state === "locked" ? C.yellow : state === "filled" ? C.accent : C.empty;
  const bg = filled ? c + "20" : "transparent";
  const h = Math.round((size * 44) / 36);

  return (
    <svg
      width={size} height={h} viewBox="0 0 36 44"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={title}
      style={{ cursor: onClick ? "pointer" : "default", flex: "0 0 auto", display: "block" }}
    >
      {title ? <title>{title}</title> : null}
      <rect x="7"  y="0"  width="22" height="7"  rx="3.5" fill={filled ? c : "transparent"} stroke={c} strokeWidth="1.5" />
      <rect x="0"  y="9"  width="5"  height="14" rx="2.5" fill={filled ? c : "transparent"} stroke={c} strokeWidth="1.5" />
      <rect x="7"  y="8"  width="22" height="18" rx="3"   fill={bg}                          stroke={c} strokeWidth="1.5" />
      <rect x="31" y="9"  width="5"  height="14" rx="2.5" fill={filled ? c : "transparent"} stroke={c} strokeWidth="1.5" />
      <rect x="3"  y="28" width="30" height="7"  rx="3"   fill={filled ? c : "transparent"} stroke={c} strokeWidth="1.5" />
    </svg>
  );
}
