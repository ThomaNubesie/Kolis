import "./globals.css";

export const metadata = { title: "Kolis Admin", description: "Concord Express · Kolis admin console" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
