"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { OrgGate, useOrg } from "@/lib/org-context";
import { useLang, LangToggle } from "@/lib/i18n";

const NAV = [
  { href: "/developer", icon: "🔑", label: "API keys", fr: "Clés API" },
  { href: "/developer/webhooks", icon: "🪝", label: "Webhooks", fr: "Webhooks" },
  { href: "/developer/docs", icon: "📘", label: "Docs", fr: "Documentation" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang } = useLang();
  const { orgs, active, setActive } = useOrg();
  const isActive = (href: string) => (href === "/developer" ? path === "/developer" : path.startsWith(href));
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Kolis · Developers</div>
        {orgs.length > 1 ? (
          <select className="input" style={{ marginBottom: 10, fontSize: 12 }} value={active.org_id} onChange={(e) => setActive(e.target.value)}>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        ) : <div style={{ color: "#fff", fontSize: 12, padding: "0 8px 10px", opacity: .8 }}>{active.name}</div>}
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={"nav" + (isActive(n.href) ? " on" : "")}><span>{n.icon}</span>{lang === "fr" ? n.fr : n.label}</Link>
        ))}
        <div className="who">
          <div style={{ marginBottom: 8 }}><LangToggle /></div>
          {active.role?.toUpperCase()} · {t("DEVELOPER", "DÉVELOPPEUR")}<br />
          <button className="nav" style={{ padding: "6px 0", marginTop: 6 }} onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>↩︎ {t("Sign out", "Déconnexion")}</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return <OrgGate portal="any"><Shell>{children}</Shell></OrgGate>;
}
