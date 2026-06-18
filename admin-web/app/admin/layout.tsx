"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase, api } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";

// `cap` = the capability a section requires; `owner` = owner-only (Team & access).
const NAV = [
  { href: "/admin", icon: "📊", label: "Overview", fr: "Aperçu" },
  { href: "/admin/orgs", icon: "🏢", label: "Organizations", fr: "Organisations", cap: "orgs" },
  { href: "/admin/revenue", icon: "💰", label: "Revenue", fr: "Revenus", cap: "revenue" },
  { href: "/admin/parcels", icon: "📦", label: "Parcels", fr: "Colis", cap: "parcels" },
  { href: "/admin/claims", icon: "🛡️", label: "Claims", fr: "Réclamations", cap: "claims" },
  { href: "/admin/members", icon: "👥", label: "Members", fr: "Membres", cap: "members" },
  { href: "/admin/outreach", icon: "✉️", label: "Outreach", fr: "Prospection", owner: true },
  { href: "/admin/team", icon: "🔑", label: "Team & access", fr: "Équipe et accès", owner: true },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang } = useLang();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [caps, setCaps] = useState<string[]>([]);

  const allowed = (n: { cap?: string; owner?: boolean }) =>
    (!n.cap && !n.owner) || (n.owner ? role === "owner" : caps.includes(n.cap!));

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      try {
        const [r, c] = await Promise.all([api.role(), api.caps().catch(() => [] as string[])]);
        if (!r) { await supabase.auth.signOut(); router.replace("/login"); return; }
        setRole(r); setCaps(c || []);
        // Defense in depth: bounce a staffer who deep-links into a section they lack.
        const hit = NAV.find((n) => n.href !== "/admin" && path.startsWith(n.href));
        if (hit && !(hit.owner ? r === "owner" : (c || []).includes(hit.cap!))) { router.replace("/admin"); return; }
      } catch { router.replace("/login"); }
    })();
  }, [router, path]);

  if (role === undefined) return <div className="center">{t("Loading…", "Chargement…")}</div>;

  const isActive = (href: string) => href === "/admin" ? path === "/admin" : path.startsWith(href);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Kolis · Admin</div>
        {NAV.filter(allowed).map((n) => (
          <Link key={n.href} href={n.href} className={"nav" + (isActive(n.href) ? " on" : "")}>
            <span>{n.icon}</span>{lang === "fr" ? n.fr : n.label}
          </Link>
        ))}
        <div className="who">
          <div style={{ marginBottom: 8 }}><LangToggle /></div>
          {role?.toUpperCase()}<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>↩︎ {t("Sign out", "Déconnexion")}</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
