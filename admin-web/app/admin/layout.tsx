"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase, api } from "@/lib/supabase";

const NAV = [
  { href: "/admin", icon: "📊", label: "Overview" },
  { href: "/admin/orgs", icon: "🏢", label: "Organizations" },
  { href: "/admin/parcels", icon: "📦", label: "Parcels" },
  { href: "/admin/claims", icon: "🛡️", label: "Claims" },
  { href: "/admin/members", icon: "👥", label: "Members" },
  { href: "/admin/team", icon: "🔑", label: "Team & access", owner: true },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      try {
        const r = await api.role();
        if (!r) { await supabase.auth.signOut(); router.replace("/login"); return; }
        setRole(r);
      } catch { router.replace("/login"); }
    })();
  }, [router]);

  if (role === undefined) return <div className="center">Loading…</div>;

  const isActive = (href: string) => href === "/admin" ? path === "/admin" : path.startsWith(href);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Kolis · Admin</div>
        {NAV.filter((n) => !n.owner || role === "owner").map((n) => (
          <Link key={n.href} href={n.href} className={"nav" + (isActive(n.href) ? " on" : "")}>
            <span>{n.icon}</span>{n.label}
          </Link>
        ))}
        <div className="who">
          {role?.toUpperCase()}<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>↩︎ Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
