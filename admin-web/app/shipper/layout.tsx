"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, org } from "@/lib/supabase";
import { OrgGate, useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import {
  LayoutDashboard, PackagePlus, Upload, Send, Package, Truck, Users, Boxes, Tag,
  Megaphone, TrendingUp, ReceiptText, CreditCard, Star, UsersRound, Palette, Building2,
  LogOut, Search, HelpCircle, Settings, LayoutGrid, ChevronsUpDown, ArrowRight, Code2, Lock,
} from "lucide-react";

type NavItem = { href: string; Icon: any; en: string; fr: string };
type NavGroup = { head: { en: string; fr: string } | null; items: NavItem[] };

// Per-plan feature gating: the minimum plan that unlocks each feature. Anything
// not listed is available on every plan (incl. Pay-as-you-go). Mirrors the
// features advertised on /shipper/plans.
type Plan = "free" | "business" | "pro";
const PLAN_RANK: Record<Plan, number> = { free: 0, business: 1, pro: 2 };
const FEATURE_MIN: Record<string, Plan> = {
  "/shipper/import": "business",   // Bulk import
  "/shipper/bulk": "business",     // Bulk shipment
  "/shipper/analytics": "business",
  "/shipper/branding": "business",
  "/shipper/team": "business",     // Team & seats
  "/freight": "business",          // Freight quoting
  "/developer": "pro",             // API access
};
const rankOf = (p?: string) => PLAN_RANK[(p as Plan) || "free"] ?? 0;

// Grouped sidebar (scrollable). Overview is pinned on top; the rest live under
// SHIP / GROW / MONEY / WORKSPACE section headers.
const GROUPS: NavGroup[] = [
  { head: null, items: [
    { href: "/shipper", Icon: LayoutDashboard, en: "Overview", fr: "Aperçu" },
  ] },
  { head: { en: "Ship", fr: "Expédier" }, items: [
    { href: "/shipper/create", Icon: PackagePlus, en: "New shipment", fr: "Nouvel envoi" },
    { href: "/shipper/import", Icon: Upload, en: "Bulk import", fr: "Import en lot" },
    { href: "/shipper/bulk", Icon: Send, en: "Bulk shipment", fr: "Envoi en lot" },
    { href: "/shipper/shipments", Icon: Package, en: "Shipments", fr: "Envois" },
    { href: "/freight", Icon: Truck, en: "Freight · pallets", fr: "Fret · palettes" },
  ] },
  { head: { en: "Grow", fr: "Croissance" }, items: [
    { href: "/shipper/clients", Icon: Users, en: "Clients", fr: "Clients" },
    { href: "/shipper/products", Icon: Boxes, en: "Products", fr: "Produits" },
    { href: "/shipper/promotions", Icon: Tag, en: "Promotions", fr: "Promotions" },
    { href: "/shipper/campaigns", Icon: Megaphone, en: "Campaigns", fr: "Campagnes" },
    { href: "/shipper/analytics", Icon: TrendingUp, en: "Analytics", fr: "Statistiques" },
  ] },
  { head: { en: "Money", fr: "Finances" }, items: [
    { href: "/shipper/invoices", Icon: ReceiptText, en: "Invoices", fr: "Factures" },
    { href: "/shipper/billing", Icon: CreditCard, en: "Billing", fr: "Facturation" },
    { href: "/shipper/plans", Icon: Star, en: "Plans", fr: "Forfaits" },
  ] },
  { head: { en: "Workspace", fr: "Espace" }, items: [
    { href: "/shipper/team", Icon: UsersRound, en: "Team & seats", fr: "Équipe et sièges" },
    { href: "/shipper/branding", Icon: Palette, en: "Branding", fr: "Image de marque" },
    { href: "/shipper/account", Icon: Building2, en: "Account", fr: "Compte" },
  ] },
];

// The top-bar grid (▦) opens this Kolis product switcher.
type App = { href: string; en: string; fr: string; sen: string; sfr: string; bg: string; text?: string; Icon?: any; dark?: boolean };
const APPS: App[] = [
  { href: "/shipper", en: "Business", fr: "Business", sen: "Ship & manage", sfr: "Expédier & gérer", bg: "linear-gradient(135deg,var(--accent),var(--accentDk))", text: "Ko" },
  { href: "/track", en: "Track", fr: "Suivi", sen: "Live tracking", sfr: "Suivi en direct", bg: "#3B6EA5", Icon: ArrowRight },
  { href: "/carrier", en: "Carrier", fr: "Transporteur", sen: "Drivers & payouts", sfr: "Chauffeurs & paiements", bg: "#15110f", Icon: Truck },
  { href: "/freight", en: "Freight", fr: "Fret", sen: "Pallets", sfr: "Palettes", bg: "#E8B931", Icon: Boxes, dark: true },
  { href: "/developer", en: "Developer", fr: "Développeur", sen: "API & webhooks", sfr: "API & webhooks", bg: "#2ECC8F", Icon: Code2, dark: true },
  { href: "/shipper/analytics", en: "Analytics", fr: "Statistiques", sen: "Insights", sfr: "Analyses", bg: "#5A6B63", Icon: TrendingUp },
];

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang, setLang } = useLang();
  const { orgs, active, setActive } = useOrg();
  const [brand, setBrand] = useState<any>(null);
  const [appsOpen, setAppsOpen] = useState(false);
  useEffect(() => { org.branding(active.org_id).then(setBrand).catch(() => setBrand(null)); }, [active.org_id]);
  const isActive = (href: string) => (href === "/shipper" ? path === "/shipper" : path.startsWith(href));

  // Hard gate #1 (first): a new/invited org must choose a subscription before the
  // portal activates. Blocks EVERY page (redirects to /shipper/plans) until done.
  const [needsPlan, setNeedsPlan] = useState<boolean | undefined>(undefined);
  useEffect(() => { org.needsPlan(active.org_id).then(setNeedsPlan).catch(() => setNeedsPlan(false)); }, [active.org_id]);
  useEffect(() => {
    if (needsPlan && path !== "/shipper/plans") { router.replace("/shipper/plans"); }
  }, [needsPlan, path, router]);

  // Hard gate #2: an owner/admin whose account is missing phone/email/business address
  // is redirected to /shipper/account and can't use the rest of the portal until done.
  const [acct, setAcct] = useState<any>(undefined);
  useEffect(() => { org.account(active.org_id).then(setAcct).catch(() => setAcct(null)); }, [active.org_id]);
  useEffect(() => {
    if (needsPlan) return; // choose a plan first
    if (acct && !acct.complete && (acct.role === "owner" || acct.role === "admin") && path !== "/shipper/account") {
      router.replace("/shipper/account");
    }
  }, [acct, needsPlan, path, router]);

  // Per-plan feature gating: the chosen plan only activates its own features.
  const [plan, setPlan] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.rpc("kolis_org_plan", { p_org: active.org_id }).then(
      ({ data }) => setPlan(((Array.isArray(data) ? data[0] : data) as any)?.plan || "free"),
      () => setPlan("free"),
    );
  }, [active.org_id]);
  const locked = (href: string) => { const m = FEATURE_MIN[href]; return !!m && rankOf(plan) < PLAN_RANK[m]; };
  // Block direct-URL access to a shipper feature the plan doesn't include.
  useEffect(() => {
    if (needsPlan || plan === undefined) return;
    const hit = Object.keys(FEATURE_MIN).find((k) => k.startsWith("/shipper") && (path === k || path.startsWith(k + "/")));
    if (hit && rankOf(plan) < PLAN_RANK[FEATURE_MIN[hit]]) router.replace("/shipper/plans");
  }, [plan, needsPlan, path, router]);

  const planGate = needsPlan === true && path !== "/shipper/plans";
  const gated = planGate || (!needsPlan && acct && !acct.complete && (acct.role === "owner" || acct.role === "admin") && path !== "/shipper/account");
  const initials = (active.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="bp" style={brand?.color ? ({ ["--accent" as any]: brand.color }) : undefined}>
      {/* ---------- TOP BAR ---------- */}
      <header className="bp-top">
        <div className="bp-logo">Ko</div>
        <div className="bp-word">Kolis <b>Business</b> Desktop</div>
        <div className="bp-search">
          <Search size={17} strokeWidth={2.2} />
          <input placeholder={t("Search everything — parcels, clients, invoices…", "Rechercher — colis, clients, factures…")} aria-label={t("Search", "Rechercher")} />
          <span className="k">⌘K</span>
        </div>
        <div className="bp-spacer" />
        <div className="bp-tools">
          <a className="bp-tbtn" href="mailto:support@concordexpress.ca" title={t("Help & questions", "Aide & questions")}><HelpCircle size={21} strokeWidth={2} /></a>
          <Link className="bp-tbtn" href="/shipper/account" title={t("Settings", "Paramètres")}><Settings size={21} strokeWidth={1.9} /></Link>
          <button className={"bp-tbtn" + (appsOpen ? " act" : "")} onClick={() => setAppsOpen((v) => !v)} title={t("Kolis apps", "Applications Kolis")} aria-label="Apps"><LayoutGrid size={20} strokeWidth={2} /></button>
          <Link className="bp-avatar" href="/shipper/account" title={active.name}>{initials}</Link>
          {appsOpen && (
            <>
              <div className="bp-popbg" onClick={() => setAppsOpen(false)} />
              <div className="bp-pop">
                <h4>{t("Kolis apps", "Applications Kolis")}</h4>
                <div className="bp-apps">
                  {APPS.map((a) => (
                    <Link key={a.href + a.en} href={a.href} className="bp-appt" onClick={() => setAppsOpen(false)}>
                      <div className="aic" style={{ background: a.bg }}>
                        {a.text ? a.text : a.Icon ? <a.Icon size={20} strokeWidth={2} color={a.dark ? "#0F1A17" : "#fff"} /> : null}
                      </div>
                      <span>{lang === "fr" ? a.fr : a.en}</span>
                      <small>{lang === "fr" ? a.sfr : a.sen}</small>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ---------- SIDEBAR + MAIN ---------- */}
      <div className="bp-body">
        <aside className="bp-side">
          {/* Business name = first item on the tab menu (org switcher when multi-org). */}
          <div className="bp-org">
            <div className="ic"><Building2 size={17} strokeWidth={2} /></div>
            <div>
              <div className="nm">{active.name}</div>
              <div className="sub">{t("Business", "Business")}{active.role ? ` · ${active.role}` : ""}</div>
            </div>
            {orgs.length > 1 && <>
              <ChevronsUpDown className="cv" size={15} strokeWidth={2.2} />
              <select className="bp-orgsel" value={active.org_id} onChange={(e) => setActive(e.target.value)} aria-label={t("Switch business", "Changer d'entreprise")}>
                {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
              </select>
            </>}
          </div>

          {/* Scrollable, grouped tabs */}
          <nav className="bp-navwrap">
            {GROUPS.map((g, gi) => (
              <div key={gi}>
                {g.head && <div className={"bp-navhead" + (gi === 1 ? " first" : "")}>{lang === "fr" ? g.head.fr : g.head.en}</div>}
                {g.items.map((n) => (
                  locked(n.href) ? (
                    <Link key={n.href} href="/shipper/plans" className="bp-nav" style={{ opacity: 0.55 }}
                      title={t("Upgrade your plan to unlock", "Améliorez votre forfait pour débloquer")}>
                      <n.Icon size={17} strokeWidth={2} />{lang === "fr" ? n.fr : n.en}
                      <Lock size={13} strokeWidth={2.2} style={{ marginLeft: "auto" }} />
                    </Link>
                  ) : (
                    <Link key={n.href} href={n.href} className={"bp-nav" + (isActive(n.href) ? " on" : "")}>
                      <n.Icon size={17} strokeWidth={2} />{lang === "fr" ? n.fr : n.en}
                    </Link>
                  )
                ))}
              </div>
            ))}
          </nav>

          {/* Footer: FR/EN + sign out */}
          <div className="bp-foot">
            <div className="bp-langrow">
              <button className={lang === "fr" ? "on" : ""} onClick={() => setLang("fr")}>FR</button>
              <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            </div>
            <button className="bp-signout" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>
              <LogOut size={16} strokeWidth={2} />{t("Sign out", "Déconnexion")}
            </button>
          </div>
        </aside>

        <main className="bp-main">
          {gated
            ? <div style={{ padding: 24 }}>{t("Complete your account details to continue…", "Complétez les détails de votre compte pour continuer…")}</div>
            : children}
        </main>
      </div>
    </div>
  );
}

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  return <OrgGate portal="shipper"><Shell>{children}</Shell></OrgGate>;
}
