import { headers } from "next/headers";
import type { Metadata } from "next";
import BoardsHome from "@/components/BoardsHome";
import KolisHome from "@/components/KolisHome";

// Server component: the root picks its surface by Host header so the page ships
// as fully-rendered HTML (SEO + clean link previews), no client-side flash.
//  · Quorly host  → the public Quorly-for-boards marketing homepage (app @ /forms)
//  · everything else (business.kolis.ca) → the Kolis · Business landing/router
const isQuorly = (host: string) => /quorly/i.test(host);

export function generateMetadata(): Metadata {
  const host = headers().get("host") || "";
  if (isQuorly(host)) {
    const title = "Quorly — for boards & associations";
    const description =
      "Minutes, votes, secure documents and the treasurer's receipts — in one place every board member trusts. Free 3-month pilot.";
    return {
      metadataBase: new URL("https://quorly.ca"),
      title,
      description,
      openGraph: { title, description, url: "https://quorly.ca", siteName: "Quorly", locale: "en_CA", type: "website" },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: "https://quorly.ca" },
    };
  }
  return {};
}

export default function Home() {
  const host = headers().get("host") || "";
  if (isQuorly(host)) return <BoardsHome />;
  return <KolisHome />;
}
