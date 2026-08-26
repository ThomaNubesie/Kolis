import type { Metadata } from "next";

// Quorly runs inside the Kolis admin-web build but is its own product — override
// the global "Kolis for Business" title so the browser tab reads "Quorly".
export const metadata: Metadata = {
  title: "Quorly",
  description: "Quorly — collaborative, colour-coded forms your team fills in together.",
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
