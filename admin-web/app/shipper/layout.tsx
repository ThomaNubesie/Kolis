"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { OrgGate, useOrg } from "@/lib/org-context";

const NAV = [
  { href: "/shipper", icon: "📊", label: "Overview" },
  { href: "/shipper/create", icon: "➕", label: "New shipment" },
  { href: "/shipper/import", icon: "⬆️", label: "Bulk import" },
  { href: "/shipper/shipments", icon: "📦", label: "Shipments" },
  { href: "/shipper/invoices", icon: "🧾", label: "Invoices" },
  { href: "/shipper/billing", icon: "💳", label: "Billing" },
  { href: "/shipper/team", icon: "👥", label: "Team & seats" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { orgs, active, setActive } = useOrg();
  const isActive = (href: string) => (href === "/shipper" ? path === "/shipper" : path.startsWith(href));
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Kolis · Business</div>
        {orgs.length > 1 ? (
          <select className="input" style={{ marginBottom: 10, fontSize: 12 }} value={active.org_id} onChange={(e) => setActive(e.target.value)}>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        ) : (
          <div style={{ color: "#fff", fontSize: 12, padding: "0 8px 10px", opacity: .8 }}>{active.name}</div>
        )}
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={"nav" + (isActive(n.href) ? " on" : "")}><span>{n.icon}</span>{n.label}</Link>
        ))}
        <div className="who">
          {active.role?.toUpperCase()} · SHIPPER<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>↩︎ Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  return <OrgGate portal="shipper"><Shell>{children}</Shell></OrgGate>;
}
