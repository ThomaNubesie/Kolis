// The LoadQ seat glyph — the same five rectangles as the app's components/SeatSvg.tsx and
// the board PNG in app/board/[zone]/route.tsx.
//
// One shape everywhere: a driver glancing at the tablet, the board on the wall and their own
// phone should be looking at the same object. If the geometry is ever changed, change it in
// all three — they are separate files because one is React Native, one is Satori and one is
// the DOM, not because they are allowed to drift.
//
// viewBox is 36×44 in every copy, so sizes stay proportional to the app's.
export type SeatState = "paid" | "owing" | "free";

export default function SeatGlyph({
  state, w = 16, color, title,
}: { state: SeatState; w?: number; color?: { paid: string; owing: string; free: string }; title?: string }) {
  const pal = color ?? { paid: "#1F8A55", owing: "#B4801F", free: "#C9CDD4" };
  const c = state === "paid" ? pal.paid : state === "owing" ? pal.owing : pal.free;

  // A free seat is an outline; a taken one is solid. The backrest carries a wash rather than
  // full ink so a filled seat still reads as a seat and not a block.
  const fill = state === "free" ? "transparent" : c;
  const bg = state === "free" ? "transparent" : c + "38";
  const h = Math.round((w * 44) / 36);

  return (
    <svg width={w} height={h} viewBox="0 0 36 44" style={{ display: "block", flex: "none" }}>
      {title ? <title>{title}</title> : null}
      <rect x="7"  y="0"  width="22" height="7"  rx="3.5" fill={fill} stroke={c} strokeWidth="2" />
      <rect x="0"  y="9"  width="5"  height="14" rx="2.5" fill={fill} stroke={c} strokeWidth="2" />
      <rect x="7"  y="8"  width="22" height="18" rx="3"   fill={bg}   stroke={c} strokeWidth="2" />
      <rect x="31" y="9"  width="5"  height="14" rx="2.5" fill={fill} stroke={c} strokeWidth="2" />
      <rect x="3"  y="28" width="30" height="7"  rx="3"   fill={fill} stroke={c} strokeWidth="2" />
    </svg>
  );
}
