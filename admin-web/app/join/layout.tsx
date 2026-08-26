import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join on Quorly",
  description: "You've been invited to a Quorly form.",
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
