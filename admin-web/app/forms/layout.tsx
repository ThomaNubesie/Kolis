import type { Metadata } from "next";

// Quorly runs inside the Kolis admin-web build but is its own product.
//
// Overriding the title was not enough. The ROOT layout sets
// `metadataBase: https://business.kolis.ca`, and metadataBase is what every
// relative metadata URL resolves against — so quorly.ca/forms was serving
// og:image = https://business.kolis.ca/opengraph-image with
// og:image:alt = "Kolis for Business". Paste a Quorly link into iMessage,
// WhatsApp or Slack and the unfurled card was Kolis, magenta "Ship more. Bill
// monthly." and all. The page itself was always Quorly; only the preview lied.
//
// Setting metadataBase here points those URLs at quorly.ca, where
// app/opengraph-image.tsx renders the Quorly card (it reads the Host header,
// the same trick app/icon.tsx uses for the favicon).
export const metadata: Metadata = {
  metadataBase: new URL("https://quorly.ca"),
  title: "Quorly",
  description: "Quorly — collaborative, colour-coded forms your team fills in together.",
  openGraph: {
    type: "website",
    siteName: "Quorly",
    url: "https://quorly.ca/forms",
    title: "Quorly — decide together, on the record",
    description: "Boards, associations and committees. Everyone gets a colour; every entry is timed, numbered and signed.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Quorly — decide together, on the record" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Quorly — decide together, on the record",
    description: "Boards, associations and committees. Everyone gets a colour; every entry is timed, numbered and signed.",
    images: [{ url: "/opengraph-image", alt: "Quorly — decide together, on the record" }],
  },
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
