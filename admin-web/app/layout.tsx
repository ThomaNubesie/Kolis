import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://business.kolis.ca"),
  title: "Kolis for Business",
  description: "Net-terms shipping for businesses, by Concord Express.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
