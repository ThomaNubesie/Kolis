"use client";
// One department mark, rendered the same way everywhere it appears.
//
// The value is either "lucide:<name>" or a literal emoji, so a single column carries
// both and nothing had to migrate when icons were added. An icon inherits `color` from
// its surface — indigo in a rail, white on a selected row — which is the whole reason
// to offer icons alongside emoji: an emoji is a coloured picture and cannot follow the
// interface. Falls back to the caller's own default when nothing is set.
import { ICONS, isIconMark, iconName } from "./deptIcons";

export default function DeptMark({ value, size = 15, fallback = null }: {
  value?: string | null;
  size?: number;
  fallback?: React.ReactNode;
}) {
  if (isIconMark(value)) {
    const Ico = ICONS[iconName(value as string)];
    // A mark saved before an icon was renamed or removed must not blank the row.
    if (Ico) return <Ico size={size} />;
    return <>{fallback}</>;
  }
  if (value) return <span style={{ fontSize: size + 1, lineHeight: 1 }}>{value}</span>;
  return <>{fallback}</>;
}
