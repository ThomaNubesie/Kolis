"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, org } from "@/lib/supabase";
import { OrgGate, useOrg } from "@/lib/org-context";
import { useLang, LangToggle } from "@/lib/i18n";
import { LayoutDashboard, PackagePlus, Upload, Package, Users, Boxes, Send, Truck, TrendingUp, ReceiptText, CreditCard, Star, UsersRound, Palette, Building2, LogOut } from "lucide-react";

const NAV = [
  { href: "/shipper", Icon: LayoutDashboard, label: "Overview", fr: "Aperçu" },
  { href: "/shipper/create", Icon: PackagePlus, label: "New shipment", fr: "Nouvel envoi" },
  { href: "/shipper/import", Icon: Upload, label: "Bulk import", fr: "Import en lot" },
  { href: "/shipper/shipments", Icon: Package, label: "Shipments", fr: "Envois" },
  { href: "/shipper/clients", Icon: Users, label: "Clients", fr: "Clients" },
  { href: "/shipper/products", Icon: Boxes, label: "Products", fr: "Produits" },
  { href: "/shipper/bulk", Icon: Send, label: "Bulk shipment", fr: "Envoi en lot" },
  { href: "/freight", Icon: Truck, label: "Freight · pallets", fr: "Fret · palettes" },
  { href: "/shipper/analytics", Icon: TrendingUp, label: "Analytics", fr: "Statistiques" },
  { href: "/shipper/invoices", Icon: ReceiptText, label: "Invoices", fr: "Factures" },
  { href: "/shipper/billing", Icon: CreditCard, label: "Billing", fr: "Facturation" },
  { href: "/shipper/plans", Icon: Star, label: "Plans", fr: "Forfaits" },
  { href: "/shipper/team", Icon: UsersRound, label: "Team & seats", fr: "Équipe et sièges" },
  { href: "/shipper/branding", Icon: Palette, label: "Branding", fr: "Image de marque" },
  { href: "/shipper/account", Icon: Building2, label: "Account", fr: "Compte" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang } = useLang();
  const { orgs, active, setActive } = useOrg();
  const [brand, setBrand] = useState<any>(null);
  useEffect(() => { org.branding(active.org_id).then(setBrand).catch(() => setBrand(null)); }, [active.org_id]);
  const isActive = (href: string) => (href === "/shipper" ? path === "/shipper" : path.startsWith(href));

  // Hard gate: an owner/admin whose account is missing phone/email/business address
  // is redirected to /shipper/account and can't use the rest of the portal until done.
  const [acct, setAcct] = useState<any>(undefined);
  useEffect(() => { org.account(active.org_id).then(setAcct).catch(() => setAcct(null)); }, [active.org_id]);
  useEffect(() => {
    if (acct && !acct.complete && (acct.role === "owner" || acct.role === "admin") && path !== "/shipper/account") {
      router.replace("/shipper/account");
    }
  }, [acct, path, router]);
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
          <Link key={n.href} href={n.href} className={"nav" + (isActive(n.href) ? " on" : "")}><n.Icon size={17} strokeWidth={2} style={{ flex: "none" }} />{lang === "fr" ? n.fr : n.label}</Link>
        ))}
        <div className="who">
          <div style={{ marginBottom: 8 }}><LangToggle /></div>
          {active.role?.toUpperCase()} · {t("SHIPPER", "EXPÉDITEUR")}<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><LogOut size={15} strokeWidth={2} style={{ flex: "none" }} />{t("Sign out", "Déconnexion")}</button>
        </div>
      </aside>
      <main className="main">
        {acct && !acct.complete && (acct.role === "owner" || acct.role === "admin") && path !== "/shipper/account"
          ? <div style={{ padding: 24 }}>{t("Complete your account details to continue…", "Complétez les détails de votre compte pour continuer…")}</div>
          : children}
      </main>
    </div>
  );
}

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  return <OrgGate portal="shipper"><Shell>{children}</Shell></OrgGate>;
}
