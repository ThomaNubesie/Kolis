import type { Metadata, Viewport } from "next";

// Standalone so "Add to Home Screen" launches without browser chrome — the
// writer gets a full-screen app, not a tab. themeColor paints the status bar in
// the LoadQ orange so it does not show a white strip above the header.
export const metadata: Metadata = {
  title: "LOAD Q — Feuille du jour",
  description: "La feuille de file d'attente quotidienne, pour la tablette au point de départ.",
  appleWebApp: { capable: true, title: "LOAD Q", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },   // operational tool, never indexed
};

export const viewport: Viewport = {
  themeColor: "#D2601A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,      // stops a mistimed pinch zooming the sheet mid-shift
};

export default function SheetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
