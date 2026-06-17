"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, org } from "@/lib/supabase";
import { OrgGate, useOrg } from "@/lib/org-context";
import { useLang, LangToggle } from "@/lib/i18n";

const NAV = [
  { href: "/shipper", icon: "📊", label: "Overview", fr: "Aperçu" },
  { href: "/shipper/create", icon: "➕", label: "New shipment", fr: "Nouvel envoi" },
  { href: "/shipper/import", icon: "⬆️", label: "Bulk import", fr: "Import en lot" },
  { href: "/shipper/shipments", icon: "📦", label: "Shipments", fr: "Envois" },
  { href: "/shipper/analytics", icon: "📈", label: "Analytics", fr: "Statistiques" },
  { href: "/shipper/invoices", icon: "🧾", label: "Invoices", fr: "Factures" },
  { href: "/shipper/billing", icon: "💳", label: "Billing", fr: "Facturation" },
  { href: "/shipper/team", icon: "👥", label: "Team & seats", fr: "Équipe et sièges" },
  { href: "/shipper/branding", icon: "🎨", label: "Branding", fr: "Image de marque" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang } = useLang();
  const { orgs, active, setActive } = useOrg();
  const [brand, setBrand] = useState<any>(null);
  useEffect(() => { org.branding(active.org_id).then(setBrand).catch(() => setBrand(null)); }, [active.org_id]);
  const isActive = (href: string) => (href === "/shipper" ? path === "/shipper" : path.startsWith(href));
  return (
    <div className="app" style={brand?.color ? ({ ["--accent" as any]: brand.color }) : undefined}>
      <aside className="side">
        <div className="brand">{brand?.logo ? <img src={brand.logo} alt={brand.name || "logo"} style={{ maxHeight: 26, maxWidth: 150, objectFit: "contain" }} /> : (brand?.name || "Kolis · Business")}</div>
        {orgs.length > 1 ? (
          <select className="input" style={{ marginBottom: 10, fontSize: 12 }} value={active.org_id} onChange={(e) => setActive(e.target.value)}>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        ) : (
          <div style={{ color: "#fff", fontSize: 12, padding: "0 8px 10px", opacity: .8 }}>{active.name}</div>
        )}
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={"nav" + (isActive(n.href) ? " on" : "")}><span>{n.icon}</span>{lang === "fr" ? n.fr : n.label}</Link>
        ))}
        <div className="who">
          <div style={{ marginBottom: 8 }}><LangToggle /></div>
          {active.role?.toUpperCase()} · {t("SHIPPER", "EXPÉDITEUR")}<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>↩︎ {t("Sign out", "Déconnexion")}</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  return <OrgGate portal="shipper"><Shell>{children}</Shell></OrgGate>;
}
