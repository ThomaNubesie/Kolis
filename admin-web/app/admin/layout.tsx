"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase, api } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";
import { LayoutDashboard, Building2, CircleDollarSign, Package, ShieldCheck, Users, Target, Phone, Truck, KeyRound, LogOut, BellOff, Store } from "lucide-react";

// `cap` = the capability a section requires; `owner` = owner-only (Team & access).
const NAV = [
  { href: "/admin", Icon: LayoutDashboard, label: "Overview", fr: "Aperçu" },
  { href: "/admin/orgs", Icon: Building2, label: "Organizations", fr: "Organisations", cap: "orgs" },
  { href: "/admin/revenue", Icon: CircleDollarSign, label: "Revenue", fr: "Revenus", cap: "revenue" },
  { href: "/admin/parcels", Icon: Package, label: "Parcels", fr: "Colis", cap: "parcels" },
  { href: "/admin/claims", Icon: ShieldCheck, label: "Claims", fr: "Réclamations", cap: "claims" },
  { href: "/admin/members", Icon: Users, label: "Members", fr: "Membres", cap: "members" },
  { href: "/admin/prospects", Icon: Target, label: "Prospects", fr: "Prospects", owner: true },
  { href: "/admin/call-requests", Icon: Phone, label: "Call requests", fr: "Demandes d'appel", owner: true },
  { href: "/admin/notifications", Icon: BellOff, label: "Failed notifications", fr: "Notifications échouées", owner: true },
  { href: "/admin/freight", Icon: Truck, label: "Freight", fr: "Fret", owner: true },
  { href: "/admin/team", Icon: KeyRound, label: "Team & access", fr: "Équipe et accès", owner: true },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang } = useLang();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [caps, setCaps] = useState<string[]>([]);
  const [hasBiz, setHasBiz] = useState(false); // staff who also own a shipper org can jump to /shipper

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
        try { const { data: myOrgs } = await supabase.rpc("kolis_my_orgs"); setHasBiz(((myOrgs ?? []) as { type: string }[]).some((o) => o.type === "shipper" || o.type === "both")); } catch { /* */ }
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
            <n.Icon size={17} strokeWidth={2} style={{ flex: "none" }} />{lang === "fr" ? n.fr : n.label}
          </Link>
        ))}
        <div className="who">
          {hasBiz ? <Link href="/shipper" className="nav" style={{ marginBottom: 8, color: "#fff", background: "rgba(225,29,107,.22)" }}><Store size={15} strokeWidth={2} style={{ flex: "none" }} />{t("Business portal", "Portail entreprise")}</Link> : null}
          <div style={{ marginBottom: 8 }}><LangToggle /></div>
          {role?.toUpperCase()}<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><LogOut size={15} strokeWidth={2} style={{ flex: "none" }} />{t("Sign out", "Déconnexion")}</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
