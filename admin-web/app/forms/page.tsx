"use client";
// Quorly — forms app wired to the live cf_* backend. Three-pane: sidebar / entry
// feed / members rail. Colour-coded, numbered structured entries + comments,
// voting, translate + AI writing. Bilingual EN/FR. RLS-secured (Tier A).
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { quorly as supabase } from "@/lib/quorly";
import { useLang } from "@/lib/i18n";
import { cf, planLimitMsg, type CfFormBrief, type CfFormFull, type CfEntry, type CfFile, type CfFileRequest, type CfFolder, type CfShare, type CfFileActivity, type LostGuide, type CfDocComment, type CfDocDecision, type CfDownloadReq, type CfReceipt, type CfOrg, type CfOrgTree, type CfOfficePerson } from "@/lib/cf";
import { memberColors } from "@/lib/colors";
import { AutoTranslateProvider, useAutoT, useDeptLabel } from "@/lib/autotranslate";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";
import { buildFormPdf, pdfFilename } from "@/lib/pdf";
import ElectionPanel from "./ElectionPanel";
import OrgHome from "./OrgHome";
import TownHall from "./TownHall";
import Announcements from "./Announcements";
import { Plus, Folder, FolderPlus, Upload, Download, Eye, Link2, Clock, Pencil, FolderInput, Trash2, MoreVertical, ChevronRight, ChevronDown, X, Search, Home, Star, Share2, RotateCcw, List, LayoutGrid, Inbox, FileText, Lock, ShieldCheck, Send, CalendarClock, AlertTriangle, KeyRound, Users, LifeBuoy, ExternalLink, MapPin, MessageSquare, ThumbsUp, ThumbsDown, CheckCircle2, Receipt, Camera, Sparkles, Coins, Tag, Settings, PlusSquare, TrendingUp } from "lucide-react";

// Receipt categories. The English word is the STORED key (it lands in cf_receipts.category
// and in the AI reader's output) — only the display label is translated.
const RCAT = ["Meals", "Fuel", "Office", "Travel", "Lodging", "Supplies", "Groceries", "Utilities", "Medical", "Other"];
const RCAT_FR: Record<string, string> = { Meals: "Repas", Fuel: "Carburant", Office: "Bureau", Travel: "Déplacements", Lodging: "Hébergement", Supplies: "Fournitures", Groceries: "Épicerie", Utilities: "Services publics", Medical: "Santé", Other: "Autre" };
const rcat = (c: string | null | undefined, lang: string) => { const k = c || "Other"; return lang === "fr" ? (RCAT_FR[k] ?? k) : k; };
const RCAT_COLOR: Record<string, string> = { Meals: "#C0392B", Fuel: "#1F7A4D", Office: "#2F3AA3", Travel: "#B4801F", Lodging: "#8A5A1F", Supplies: "#6B4FA3", Groceries: "#2F8F6B", Utilities: "#0EA5A5", Medical: "#D64545", Other: "#8A8378" };
const money = (n: number | null | undefined, cur = "CAD", lang = "en") => n == null ? "—" : new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: cur || "CAD" }).format(n);
const isPdfPath = (p?: string | null) => !!p && p.toLowerCase().endsWith(".pdf");
import { deriveKey, newSalt, makeCheck, verifyCheck, decryptToBlob } from "@/lib/e2e";

// Folder colours
const FOLDER_COLORS = ["#E0A83B", "#D64545", "#E0574A", "#2F8F6B", "#0EA5A5", "#2F5BA3", "#6B4FA3", "#8A8378"];
// Priority: Urgent (red) / Important (amber) / Normal (green). Manual override wins; else auto from expiry.
const PRIO_COLOR: Record<string, string> = { urgent: "#D64545", important: "#E0A83B", normal: "#2F8F6B" };
function autoLevel(f: CfFile): "urgent" | "important" | "normal" | null {
  if (!f.expires_at) return null;
  const days = Math.ceil((new Date(f.expires_at + "T00:00:00").getTime() - Date.now()) / 86400000);
  return days <= 7 ? "urgent" : days <= 30 ? "important" : "normal";
}
function effLevel(f: CfFile): "urgent" | "important" | "normal" | null { return (f.priority as any) ?? autoLevel(f); }
function nextLevel(p?: string | null): "urgent" | "important" | "normal" | null { return p == null ? "urgent" : p === "urgent" ? "important" : p === "important" ? "normal" : null; }

// days until an expiry date + a colour band for the badge
function expiryInfo(f: CfFile, tr: (o: any) => string) {
  if (!f.expires_at) return null;
  const days = Math.ceil((new Date(f.expires_at + "T00:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: tr(L("Expired", "Expiré")), bg: "#FBE9E7", fg: "#C0392B", days };
  if (days === 0) return { label: tr(L("Expires today", "Expire aujourd'hui")), bg: "#FBE9E7", fg: "#C0392B", days };
  if (days <= 30) return { label: tr(L(`Expires in ${days}d`, `Expire dans ${days}j`)), bg: "#FBF1E0", fg: "#B4801F", days };
  return { label: tr(L(`Expires ${new Date(f.expires_at + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`, `Expire le ${new Date(f.expires_at + "T00:00:00").toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}`)), bg: "#EEEFF9", fg: "#2F3AA3", days };
}

const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const L = (en: string, fr: string) => ({ en, fr });
// The cf_* RPCs answer with machine codes ({ok:false, error:'not_admin'}). Never show one
// raw — map it here so both languages get a sentence, and fall back to a generic line.
const CF_ERR: Record<string, { en: string; fr: string }> = {
  already_candidate: L("You're already running for a position in this election.", "Vous êtes déjà candidat·e à un poste de cette élection."),
  already_invited: L("That email or phone is already on this form.", "Ce courriel ou téléphone est déjà sur ce formulaire."),
  bad_value: L("That value isn't valid.", "Cette valeur n'est pas valide."),
  color_taken: L("That colour is already taken — pick another.", "Cette couleur est déjà prise — choisissez-en une autre."),
  comments_off: L("Comments are turned off on this form.", "Les commentaires sont désactivés sur ce formulaire."),
  election_closed: L("This election is closed.", "Cette élection est terminée."),
  entries_not_allowed: L("The admin hasn't allowed members to add entries.", "L'admin n'a pas autorisé les membres à ajouter des entrées."),
  suspended: L("You're suspended — you can read here, but not post.", "Vous êtes suspendu — vous pouvez lire ici, mais pas publier."),
  suspended_only: L("Only suspended members may post here right now.", "Seuls les membres suspendus peuvent publier ici pour l'instant."),
  cannot_change_self: L("You can't change your own rights here.", "Vous ne pouvez pas modifier vos propres droits ici."),
  forbidden: L("You don't have access to that.", "Vous n'avez pas accès à cet élément."),
  invalid_contact: L("Enter a valid email or phone.", "Entrez un courriel ou téléphone valide."),
  invalid_or_used: L("That invite link is invalid or has already been used.", "Ce lien d'invitation est invalide ou déjà utilisé."),
  invalid_code: L("That invite code isn't valid.", "Ce code d'invitation n'est pas valide."),
  name_required: L("A name is required.", "Un nom est requis."),
  no_candidate: L("No candidate found.", "Aucun candidat trouvé."),
  no_invite: L("No invitation found for your account on this form.", "Aucune invitation trouvée pour votre compte sur ce formulaire."),
  not_admin: L("Only the admin can do that.", "Seul l'admin peut faire cela."),
  not_authed: L("Please sign in again.", "Veuillez vous reconnecter."),
  not_author: L("Only the author can change this.", "Seul l'auteur peut modifier ceci."),
  not_election: L("This sub-form isn't an election.", "Ce sous-formulaire n'est pas une élection."),
  not_found: L("Not found.", "Introuvable."),
  not_member: L("You're not a member of this form.", "Vous n'êtes pas membre de ce formulaire."),
  not_parent_member: L("You must be a member of the organization first.", "Vous devez d'abord être membre de l'organisation."),
  position_required: L("Choose a position.", "Choisissez un poste."),
  reason_required: L("A reason is required.", "Une raison est requise."),
  unknown_position: L("That position doesn't exist in this election.", "Ce poste n'existe pas dans cette élection."),
  voting_off: L("Voting is turned off on this form.", "Le vote est désactivé sur ce formulaire."),
};
const cfErr = (code: any, tr: (o: { en: string; fr: string }) => string) =>
  tr(CF_ERR[String(code ?? "")] ?? L("Something went wrong. Please try again.", "Une erreur est survenue. Veuillez réessayer."));
// A field's label is the key its answers are stored under, so it never changes; when the
// template seeded a translation, show that instead — the key underneath stays canonical.
const flabel = (f: any, lang: string) => f?.label_i18n?.[lang] ?? f?.label ?? "";
const foption = (f: any, o: string, lang: string) => f?.options_i18n?.[o]?.[lang] ?? o;
const initials = (n?: string | null) => { if (!n) return "?"; const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase(); };
const fmt = (iso: string, lang: string) => { try { return new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
const fmtDate = (iso: string, lang: string) => { try { return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" }); } catch { return iso; } };
function useMobile(bp = 820) { const [m, setM] = useState(false); useEffect(() => { const f = () => setM(window.innerWidth < bp); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [bp]); return m; }

export default function FormsPage() {
  return <Suspense fallback={null}><QuorlyAuthGate><FormsShell /></QuorlyAuthGate></Suspense>;
}

// The provider has to sit OUTSIDE FormsInner: hooks called in that component's body
// would otherwise read the default (identity) context and never translate.
function FormsShell() {
  const { lang } = useLang();
  return <AutoTranslateProvider lang={lang}><FormsInner /></AutoTranslateProvider>;
}

function FormsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const mobile = useMobile();
  const { lang, setLang } = useLang();   // shared + persisted, so the choice follows the member across screens
  const at = useAutoT();                 // written content, in the reader's language
  const dlabel = useDeptLabel();         // Town Hall reads Assemblée in French, not "Hôtel de ville"
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [list, setList] = useState<CfFormBrief[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<CfFormFull | null>(null);
  const [entries, setEntries] = useState<CfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [tab, setTab] = useState<"entries" | "folders" | "files" | "subforms" | "receipts">("entries");
  const [meta, setMeta] = useState<{ kind?: string; parent_id: string | null; parent_name: string | null; org_id?: string | null; group_name: string | null; subform_count: number } | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [show2fa, setShow2fa] = useState(false);
  // An ORGANIZATION is the container the group's whole life lives in; its
  // DEPARTMENTS are the boards inside it. `tree` is the whole left rail in one
  // round trip (cf_org_tree), so switching organizations is a single call.
  const [orgs, setOrgs] = useState<CfOrg[]>([]);
  const [activeOrg, setActiveOrg] = useState<string | null>(null);
  const [tree, setTree] = useState<CfOrgTree | null>(null);
  const [orgSwitch, setOrgSwitch] = useState(false);
  const [orgTab, setOrgTab] = useState<"home" | "members" | "documents" | "settings">("home");
  const [qoAdmin, setQoAdmin] = useState(false); // outreach/prospecting operator → sees the GROWTH rail group
  const [newSpace, setNewSpace] = useState(false);
  const isVault = !!sel && sel === vaultId;
  const isOrg = !!sel && orgs.some((o) => o.id === sel);
  const spaces = orgs;          // legacy alias — the shared-folder call sites below
  const isSpace = isOrg;
  const loadSpaces = useCallback(() => {
    cf.myOrgs().then((o) => { setOrgs(o); setActiveOrg((a) => (a && o.some((x) => x.id === a) ? a : o[0]?.id ?? null)); }).catch(() => {});
  }, []);
  const loadTree = useCallback((id: string) => {
    // Idempotent: creates the Town Hall department once, and re-syncs its roster with
    // the organization's, so a member who joined since lands in the hall.
    cf.ensureTownHall(id).catch(() => {})
      .then(() => cf.orgTree(id))
      .then((t) => setTree(t && !(t as any).error ? t : null))
      .catch(() => setTree(null));
  }, []);
  const openVault = async () => {
    setVaultBusy(true);
    try { const id = await cf.myVault(); setVaultId(id); setSel(id); } catch (e: any) { alert(e.message); }
    setVaultBusy(false);
  };

  const memberOf = useMemo(() => { const m: Record<string, any> = {}; (form?.members ?? []).forEach((x) => { if (x.id) m[x.id] = x; }); return m; }, [form]);

  useEffect(() => { cf.myForms().then((f) => setList(f)).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { loadSpaces(); }, [loadSpaces]);
  useEffect(() => { const o = sp.get("open"); if (o) { setSel(o); router.replace("/forms"); } }, [sp, router]);
  // Desktop (three-pane) opens the first form for convenience; mobile lands on Home (list) so
  // "back" from a form / new-form returns to the profile page, not into a form.
  useEffect(() => { if (!loading && !mobile && !sel && list.length) setSel(list[0].id); }, [loading, mobile, list, sel]);
  useEffect(() => { cf.outreachAdmin().then(setQoAdmin).catch(() => setQoAdmin(false)); }, []);
  useEffect(() => { cf.canCreate().then(setCanCreate).catch(() => {}); }, []);
  useEffect(() => { cf.myProfile().then((p) => setProfileName(p?.name || "")).catch(() => {}); }, []);
  const loadForm = useCallback(async (id: string) => {
    try { const [f, e] = await Promise.all([cf.form(id), cf.entries(id)]); setForm(f); setEntries(e); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { if (activeOrg) loadTree(activeOrg); else setTree(null); }, [activeOrg, loadTree]);
  useEffect(() => {
    if (!sel) return;
    setTab((sel === vaultId || orgs.some((o) => o.id === sel)) ? "folders" : "entries");
    // Take our seat first: a member of the organization is entitled to every
    // department in it, but the row is only materialised when they open one.
    (async () => { try { await cf.ensureMember(sel); } catch { /* not in an org — normal */ } loadForm(sel); })();
    const ch = cf.subscribe(sel, () => cf.entries(sel).then(setEntries).catch(() => {}));
    return () => { ch.unsubscribe(); };
  }, [sel, vaultId, orgs, loadForm]);
  useEffect(() => {
    if (!sel) { setMeta(null); return; }
    // A department that holds offices should show them first — its own entries are
    // rarely the point once the work is divided between its offices.
    cf.formMeta(sel).then((m) => {
      setMeta(m);
      if (m?.org_id) setActiveOrg(m.org_id);
      // A department that holds offices opens on them — but an ELECTION opens on its
      // ballot, whatever offices hang off it: while a vote is running, that is the work.
      setTab(m?.kind !== "election" && (m?.subform_count ?? 0) > 0 ? "subforms" : "entries");
    }).catch(() => setMeta(null));
  }, [sel]);

  if (loading) return <Shell><div style={{ padding: 40, color: C.faint }}>Loading…</div></Shell>;
  if (err) return <Shell><div style={{ padding: 40, color: "#B4531F" }}>{err}</div></Shell>;

  const showHome = !mobile || !sel;
  const showForm = !mobile || !!sel;
  const editName = async () => {
    const n = window.prompt(tr(L("Your name (shown in every form)", "Votre nom (affiché dans chaque formulaire)")), profileName);
    if (n && n.trim()) { try { await cf.setProfile(n.trim()); setProfileName(n.trim()); if (sel) loadForm(sel); } catch (e: any) { alert(e.message); } }
  };
  const langToggle = (
    <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
      {(["en", "fr"] as const).map((l) => <span key={l} onClick={() => { setLang(l); cf.setLang(l).catch(() => {}); }} style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>)}
    </div>
  );

  return (
    <div style={{ background: C.paper, minHeight: "100vh", padding: 0, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ width: "100%", margin: 0, display: "grid", gridTemplateColumns: mobile ? "1fr" : "280px 1fr 300px", minHeight: "100vh", background: C.paper, borderRadius: 0, overflow: "hidden", boxShadow: "none" }}>

        {/* ===== HOME / PROFILE ===== */}
        {showHome && (
          <aside style={{ background: "#F4F1EB", borderRight: mobile ? "none" : `1px solid ${C.line}`, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10, minHeight: mobile ? "100vh" : "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <div onClick={() => { setOrgSwitch(false); setOrgTab("home"); setSel(activeOrg ?? null); }} title={tr(L("Home", "Accueil"))} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>Q</div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -.2 }}>Quorly</div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 3, paddingLeft: 43 }}>{["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"].map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}</div>
              </div>
              <div style={{ marginLeft: "auto" }}>{langToggle}</div>
            </div>
            <div onClick={editName} style={{ display: "flex", alignItems: "center", gap: 11, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 11, cursor: "pointer" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>{initials(profileName) === "?" ? "🙂" : initials(profileName)}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profileName || tr(L("Set your name", "Définir votre nom"))}</div><div style={{ fontSize: 11, color: C.accent, fontWeight: 700, marginTop: 1 }}>{tr(L("Tap to edit profile", "Modifier le profil"))}</div></div>
            </div>
            <div onClick={vaultBusy ? undefined : openVault} style={{ display: "flex", alignItems: "center", gap: 11, background: C.accent, border: 0, borderRadius: 12, padding: "13px 14px", cursor: "pointer", boxShadow: isVault ? "0 0 0 3px rgba(47,58,163,.25)" : "0 6px 18px rgba(47,58,163,.30)" }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.22)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Lock size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: "#fff" }}>{vaultBusy ? tr(L("Opening…", "Ouverture…")) : tr(L("My Files", "Mes fichiers"))}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>{tr(L("Upload private documents", "Téléverser des documents privés"))}</div>
              </div>
            </div>
            {/* ===== ORGANIZATION SWITCHER ===== */}
            {orgs.length > 0 && (() => {
              const cur = orgs.find((o) => o.id === activeOrg) ?? orgs[0];
              return (
                <div style={{ position: "relative" }}>
                  <div onClick={() => orgs.length > 1 ? setOrgSwitch((v) => !v) : setSel(cur.id)} style={{ display: "flex", alignItems: "center", gap: 9, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "9px 11px", cursor: "pointer" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: cur.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, flex: "0 0 auto" }}>{(cur.name || "?").trim()[0]?.toUpperCase()}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur.name}</div>
                      {cur.my_title && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{cur.my_title}</div>}
                    </div>
                    {orgs.length > 1 && <ChevronDown size={14} style={{ color: C.faint, flex: "0 0 auto" }} />}
                  </div>
                  {orgSwitch && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.14)", padding: 5, zIndex: 30 }}>
                      {orgs.map((o) => (
                        <div key={o.id} onClick={() => { setActiveOrg(o.id); setOrgSwitch(false); setOrgTab("home"); setSel(o.id); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 8, cursor: "pointer", background: o.id === activeOrg ? C.accentSoft : "transparent" }}>
                          <span style={{ width: 22, height: 22, borderRadius: 6, background: o.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 11 }}>{(o.name || "?").trim()[0]?.toUpperCase()}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                        </div>
                      ))}
                      <div onClick={() => { setOrgSwitch(false); router.push("/forms/new-org"); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 8, cursor: "pointer", color: C.accent, fontSize: 12.5, fontWeight: 800, borderTop: `1px solid ${C.line2}`, marginTop: 3 }}>
                        <PlusSquare size={14} /> {tr(L("New organization", "Nouvelle organisation"))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ===== ORGANIZATION ===== */}
            {activeOrg && (
              <>
                <div style={railSection}>{tr(L("Organization", "Organisation"))}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {([["home", tr(L("Home", "Accueil")), <Home key="h" size={14} />],
                     ["members", tr(L("Members", "Membres")), <Users key="m" size={14} />],
                     ["documents", tr(L("Documents", "Documents")), <Folder key="d" size={14} />],
                     ["settings", tr(L("Settings", "Paramètres")), <Settings key="s" size={14} />]] as const).map(([k, label, icon]) => (
                    // Town Hall used to sit here; it is a department now, listed with the rest.
                    <div key={k} onClick={() => { setOrgTab(k as any); setSel(activeOrg); }} style={sItem(sel === activeOrg && orgTab === k)}>
                      <span style={{ color: sel === activeOrg && orgTab === k ? C.accent : C.faint, display: "inline-flex" }}>{icon}</span>{label}
                    </div>
                  ))}
                </div>

                {/* ===== DEPARTMENTS ===== */}
                <div style={{ ...railHead, display: "flex", alignItems: "center" }}>
                  {tr(L("Departments", "Départements"))}
                  {tree?.is_admin && <span onClick={() => router.push(`/forms/new?parent=${activeOrg}`)} title={tr(L("New department", "Nouveau département"))} style={{ marginLeft: "auto", color: C.accent, cursor: "pointer", display: "inline-flex" }}><PlusSquare size={14} /></span>}
                </div>
                {(tree?.departments?.length ?? 0) === 0 && <div style={{ fontSize: 12, color: C.faint, padding: "2px 6px 4px" }}>{tr(L("None yet — add the first one.", "Aucun — ajoutez le premier."))}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {groupBy(tree?.departments ?? [], (d) => d.group_name || "").map(([g, items]) => (
                    <div key={g || "_"}>
                      {g && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint, padding: "7px 8px 3px" }}>{g}</div>}
                      {items.map((d) => (
                        <div key={d.id} onClick={() => setSel(d.id)} style={{ ...sItem(d.id === sel), opacity: d.im_member || d.kind === "election" ? 1 : .72 }}>
                          <span style={{ color: d.id === sel ? C.accent : C.faint, display: "inline-flex", fontSize: d.emoji ? 14 : undefined }}>
                            {d.emoji || (d.kind === "election" ? <ThumbsUp size={14} /> : <FileText size={14} />)}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{dlabel(d)}</span>
                          {d.kind === "election" && d.election_status === "open" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flex: "0 0 auto" }} />}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ===== PERSONAL BOARDS (no organization) ===== */}
            {(() => {
              const loose = list.filter((f) => !f.org_id && f.id !== vaultId && f.kind !== "org");
              if (loose.length === 0 && orgs.length > 0) return null;
              return (
                <>
                  <div style={railSection}>{orgs.length ? tr(L("Personal", "Personnel")) : tr(L("Your forms", "Vos formulaires"))}</div>
                  {loose.length === 0 && <div style={{ fontSize: 12.5, color: C.faint, padding: "6px" }}>{tr(L("No forms yet.", "Aucun formulaire."))}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {loose.map((f) => (
                      <div key={f.id} onClick={() => setSel(f.id)} style={{ ...sItem(f.id === sel), flexDirection: "column", alignItems: "stretch", gap: 3, padding: "9px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, flex: "0 0 auto" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: C.faint, paddingLeft: 15, lineHeight: 1.3 }}>
                          {f.is_admin ? tr(L("You're admin", "Vous êtes admin")) : `${tr(L("Admin", "Admin"))}: ${f.admin ?? "—"}`}
                          {f.joined_at ? ` · ${tr(L("joined", "rejoint"))} ${fmtDate(f.joined_at, lang)}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {canCreate && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <div style={{ flex: 1, background: C.accent, color: "#fff", border: 0, borderRadius: 11, padding: 11, textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer" }} onClick={() => router.push("/forms/new-org")}>{tr(L("+ Organization", "+ Organisation"))}</div>
                <div style={{ flex: 1, background: C.panel, color: C.accent, border: `1px solid ${C.line}`, borderRadius: 11, padding: 11, textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer" }} onClick={() => router.push("/forms/new")}>{tr(L("+ Form", "+ Formulaire"))}</div>
              </div>
            )}
            <JoinCode tr={tr} router={router} />

            {/* ===== GROWTH (operator-only: prospecting / outreach) ===== */}
            {qoAdmin && (
              <>
                <div style={railSection}>{tr(L("Growth", "Croissance"))}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div onClick={() => router.push("/prospecting")} style={sItem(false)}>
                    <span style={{ color: C.faint, display: "inline-flex" }}><TrendingUp size={14} /></span>
                    {tr(L("Prospecting", "Prospection"))}
                  </div>
                </div>
              </>
            )}

            <div onClick={() => setShow2fa(true)} style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer", padding: "10px 6px 6px", borderTop: `1px solid ${C.line}` }}><ShieldCheck size={14} /> {tr(L("Security & 2FA", "Sécurité & 2FA"))}</div>
            <div onClick={async () => { await supabase.auth.signOut({ scope: "local" }); }} style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: C.ink2, cursor: "pointer", padding: "4px 6px 4px" }}>{tr(L("Sign out", "Se déconnecter"))}</div>
          </aside>
        )}

        {/* ===== 2FA GATE (form requires two-factor) ===== */}
        {showForm && form && form.needs_2fa && (
          <section style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Require2FAGate formName={form.name} tr={tr} onPassed={() => sel && loadForm(sel)} onCancel={() => setSel(null)} />
          </section>
        )}

        {/* ===== FORM VIEW ===== */}
        {showForm && form && !form.needs_2fa && (
          <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: mobile ? "13px 14px" : "16px 22px", borderBottom: `1px solid ${C.line}` }}>
              {mobile && <span onClick={() => setSel(null)} style={{ fontSize: 24, fontWeight: 800, color: C.ink, cursor: "pointer", lineHeight: 1, marginRight: 2 }}>‹</span>}
              {isVault && <span style={{ width: 34, height: 34, borderRadius: 9, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Lock size={18} /></span>}
              {isSpace && <span style={{ width: 34, height: 34, borderRadius: 9, background: "#EFEAF7", color: "#6B4FA3", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Users size={18} /></span>}
              <div style={{ minWidth: 0 }}>
                {!isVault && !isSpace && meta?.parent_id && <div onClick={() => setSel(meta.parent_id!)} style={{ fontSize: 11, fontWeight: 800, color: C.accent, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, marginBottom: 1 }}><ChevronRight size={12} style={{ transform: "rotate(180deg)" }} /> {meta.parent_name}{meta.group_name ? " · " + meta.group_name : ""}</div>}
                <div style={{ fontSize: mobile ? 16 : 18, fontWeight: 800, letterSpacing: -.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isVault ? tr(L("My Files", "Mes fichiers")) : dlabel({ kind: meta?.kind, name: form.name })}</div>
                {isVault
                  ? <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}><ShieldCheck size={13} style={{ color: C.green }} /> {tr(L("Private vault · only you can see these", "Coffre privé · vous seul y avez accès"))}</div>
                  : isSpace
                  ? <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}><Users size={12} style={{ color: "#6B4FA3" }} /> {tr(L("Organization", "Organisation"))} · {form.members.filter((m) => m.status === "active").length} {tr(L("people", "personnes"))}{form.is_admin ? " · " + tr(L("You're admin", "Vous êtes admin")) : ""}</div>
                  : <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{form.members.filter((m) => m.status === "active").length} {tr(L("members", "membres"))}{form.is_admin ? " · " + tr(L("You're admin", "Vous êtes admin")) : ""}</div>}
                {!isVault && !isSpace && form.description && <div style={{ fontSize: 12, color: C.ink2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: mobile ? 220 : 380 }}>{form.description}</div>}
              </div>
              <div style={{ marginLeft: "auto", flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                {!isVault && form.is_admin && <FormEdit form={form} tr={tr} isSpace={isSpace} onSaved={() => sel && loadForm(sel)} onDeleted={() => { setSel(null); setForm(null); setEntries([]); cf.myForms().then(setList).catch(() => {}); loadSpaces(); }} />}
                {!mobile && langToggle}
              </div>
            </div>
            {!isVault && !isSpace && <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.line}`, padding: mobile ? "0 12px" : "0 22px", overflowX: "auto" }}>
              {((["entries", "folders", "files", "subforms", "receipts"] as const)
                 // An OFFICE is already the leaf of the tree — organization ▸ department ▸
                 // office — so it offers no offices of its own. It is an office exactly when
                 // its parent is not the organization.
                 .filter((k) => k !== "subforms" || !(meta?.parent_id && meta.parent_id !== meta.org_id))
               ).map((k) => (
                <div key={k} onClick={() => setTab(k)} style={{ padding: "10px 14px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", color: tab === k ? C.accent : C.ink2, borderBottom: `2px solid ${tab === k ? C.accent : "transparent"}`, marginBottom: -1 }}>
                  {k === "entries" ? tr(L("Entries", "Entrées")) : k === "folders" ? tr(L("Folders", "Dossiers")) : k === "files" ? tr(L("Files", "Fichiers")) : k === "receipts" ? tr(L("Receipts", "Reçus")) : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{tr(L("Offices", "Bureaux"))}{meta?.subform_count ? <span style={{ fontSize: 10.5, color: C.faint }}>{meta.subform_count}</span> : null}</span>}
                </div>
              ))}
            </div>}
            {isVault && <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.line}`, padding: mobile ? "0 12px" : "0 22px" }}>
              {(["folders", "files"] as const).map((k) => (
                <div key={k} onClick={() => setTab(k)} style={{ padding: "10px 14px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", color: tab === k ? C.accent : C.ink2, borderBottom: `2px solid ${tab === k ? C.accent : "transparent"}`, marginBottom: -1 }}>
                  {k === "folders" ? tr(L("Folders", "Dossiers")) : tr(L("Files", "Fichiers"))}
                </div>
              ))}
            </div>}
            <div style={{ padding: mobile ? "14px 16px" : "18px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
              {isOrg && orgTab === "documents" ? (
                // The organization is itself a form, so its files live on it —
                // this is where a documents-only group (a shared family folder,
                // a bylaws archive) does all of its work.
                <FilesPanel form={form} tr={tr} lang={lang} mobile={mobile} entries={entries} memberOf={memberOf} isVault={false} flat={false} />
              ) : isOrg ? (
                <OrgHome tree={tree} tab={orgTab as "home" | "members" | "settings"} setTab={setOrgTab} tr={tr} lang={lang} mobile={mobile}
                  onOpen={(id: string) => setSel(id)}
                  onChanged={() => { loadSpaces(); if (activeOrg) loadTree(activeOrg); cf.myForms().then(setList).catch(() => {}); }} />
              ) : (!isVault && tab === "entries") ? (
                <>
                  <Announcements form={form.id} orgId={meta?.parent_id ?? null} tr={tr} lang={lang} mobile={mobile} />
                  {/* The hall's board lives on the ORG (cf_th_* is keyed there), so it
                      keeps every topic it already had; folders, files and receipts are
                      this department's own, on the tabs above. */}
                  {meta?.kind === "townhall" && meta.parent_id && <TownHall org={meta.parent_id} tr={tr} lang={lang} />}
                  {(form.features as any)?.election ? (
                    <ElectionPanel form={form} tr={tr} lang={lang} mobile={mobile} />
                  ) : (
                  <>
                    {form.is_admin && <PdfPanel form={form} entries={entries} memberOf={memberOf} tr={tr} lang={lang} />}
                    <NewEntry form={form} tr={tr} lang={lang} mobile={mobile} onDone={() => sel && loadForm(sel)} />
                    {entries.map((e) => <EntryCard key={e.id} e={e} form={form!} lang={lang} tr={tr} mobile={mobile} memberOf={memberOf} reload={() => sel && cf.entries(sel).then(setEntries)} />)}
                    {entries.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("No entries yet.", "Aucune entrée."))}</div>}
                  </>
                  )}
                </>
              ) : tab === "subforms" ? (
                <SubformsPanel form={form} tr={tr} lang={lang} onOpen={(id: string) => setSel(id)} />
              ) : tab === "receipts" ? (
                <ReceiptsPanel form={form} tr={tr} lang={lang} mobile={mobile} />
              ) : (
                <>
                  {isVault && tab === "folders" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.faint }}>
                        <Users size={13} style={{ marginRight: 6, color: "#6B4FA3" }} /> {tr(L("Organizations", "Organisations"))}
                        <span onClick={() => router.push("/forms/new-org")} style={{ marginLeft: "auto", color: C.accent, cursor: "pointer", fontSize: 12, letterSpacing: 0, textTransform: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><FolderPlus size={13} /> {tr(L("New organization", "Nouvelle organisation"))}</span>
                      </div>
                      {spaces.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>{tr(L("An organization holds your group's departments, members and documents in one place.", "Une organisation regroupe les départements, membres et documents de votre groupe."))}</div>}
                      {spaces.map((s) => (
                        <div key={s.id} onClick={() => setSel(s.id)} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 13px", cursor: "pointer" }}>
                          <span style={{ width: 34, height: 34, borderRadius: 9, background: "#EFEAF7", color: "#6B4FA3", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Users size={17} /></span>
                          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div><div style={{ fontSize: 11.5, color: C.faint }}>{s.members} {tr(L("people", "personnes"))}{s.invited ? ` · ${s.invited} ${tr(L("invited", "invités"))}` : ""}</div></div>
                          <ChevronRight size={16} style={{ color: C.faint }} />
                        </div>
                      ))}
                      <div style={{ height: 1, background: C.line, margin: "4px 0 2px" }} />
                    </div>
                  )}
                  <FilesPanel form={form} tr={tr} lang={lang} mobile={mobile} entries={entries} memberOf={memberOf} isVault={isVault} flat={tab === "files"} />
                </>
              )}
              {mobile && !isVault && (
                <aside style={{ background: "#F7F4EE", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 14px", marginTop: 4 }}>
                  <MembersRail form={form} meta={meta} tr={tr} lang={lang} sel={sel} loadForm={loadForm} />
                </aside>
              )}
            </div>
          </section>
        )}

        {/* ===== MEMBERS RAIL (desktop) — hidden for the private vault ===== */}
        {showForm && form && !mobile && !isVault && (
          <aside style={{ background: "#F7F4EE", borderLeft: `1px solid ${C.line}`, padding: "18px 16px", overflow: "auto" }}>
            <MembersRail form={form} meta={meta} tr={tr} lang={lang} sel={sel} loadForm={loadForm} />
          </aside>
        )}
        {/* Vault: security reassurance rail (desktop) */}
        {showForm && form && !mobile && isVault && (
          <aside style={{ background: "#F7F4EE", borderLeft: `1px solid ${C.line}`, padding: "18px 16px", overflow: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, padding: "2px 2px 10px" }}>{tr(L("Security", "Sécurité"))}</div>
            {[
              L("Private to your account only", "Privé à votre compte seulement"),
              L("Encrypted at rest (AES-256)", "Chiffré au repos (AES-256)"),
              L("Links expire & can need a password", "Liens expirables, avec mot de passe"),
              L("Every action is logged", "Chaque action est journalisée"),
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: C.ink2, padding: "6px 0" }}>
                <ShieldCheck size={15} style={{ color: C.green, flex: "0 0 auto", marginTop: 1 }} /> {tr(t)}
              </div>
            ))}
          </aside>
        )}

        {/* ===== DESKTOP EMPTY STATE ===== */}
        {!mobile && !form && (
          <section style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 14, padding: 40 }}>
            {tr(L("Select a form, or create a new one.", "Sélectionnez un formulaire ou créez-en un."))}
          </section>
        )}
      </div>
      {show2fa && <TwoFactorModal tr={tr} onClose={() => setShow2fa(false)} />}
      {newSpace && <NewSpaceModal tr={tr} onClose={() => setNewSpace(false)} onCreated={(id: string) => { setNewSpace(false); loadSpaces(); setSel(id); }} />}
    </div>
  );
}

function NewSpaceModal({ tr, onClose, onCreated }: any) {
  const [name, setName] = useState(""); const [invites, setInvites] = useState(""); const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return; setBusy(true);
    try {
      const list = invites.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean).map((c) => ({ contact: c }));
      const r = await cf.createSpace(name.trim(), list);
      onCreated(r.form_id);
    } catch (e: any) { alert(e.message); setBusy(false); }
  };
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Users size={17} style={{ color: "#6B4FA3" }} /> {tr(L("New shared folder", "Nouveau dossier partagé"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16 }}>
      <div style={railLbl}>{tr(L("Space name", "Nom de l'espace"))}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(L("e.g. Family Documents", "ex. Documents famille"))} style={{ ...inp, marginTop: 6 }} autoFocus />
      <div style={{ ...railLbl, marginTop: 14 }}>{tr(L("Invite people (optional)", "Inviter des personnes (optionnel)"))}</div>
      <textarea value={invites} onChange={(e) => setInvites(e.target.value)} placeholder={tr(L("email or phone, one per line", "courriel ou téléphone, un par ligne"))} style={{ ...inp, minHeight: 64, marginTop: 6 }} />
      <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>{tr(L("Everyone you invite can upload and retrieve files here.", "Toutes les personnes invitées peuvent téléverser et récupérer des fichiers."))}</div>
      <button onClick={create} disabled={busy || !name.trim()} style={{ width: "100%", marginTop: 16, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy || !name.trim() ? .6 : 1 }}>{busy ? "…" : tr(L("Create space", "Créer l'espace"))}</button>
    </div>
  </>, onClose, 400);
}

function Shell({ children }: { children: any }) {
  return <div style={{ background: C.paper, minHeight: "100vh", padding: 0 }}>{children}</div>;
}

function PdfPanel({ form, entries, memberOf, tr, lang }: any) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState("");
  const memberEmails: string[] = (form.members ?? []).filter((m: any) => m.contact && String(m.contact).includes("@")).map((m: any) => m.contact);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const download = async () => { setBusy(true); try { const doc = await buildFormPdf(form, entries, memberOf, lang); doc.save(pdfFilename(form)); } catch (e: any) { alert(e.message); } setBusy(false); };
  const email = async () => {
    const chosen = memberEmails.filter((e) => !off[e]);
    const extras = extra.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const to = Array.from(new Set([...chosen, ...extras]));
    if (to.length === 0) { alert(tr(L("Add at least one recipient.", "Ajoutez au moins un destinataire."))); return; }
    setBusy(true);
    try {
      const doc = await buildFormPdf(form, entries, memberOf, lang);
      const b64 = doc.output("datauristring").split(",")[1];
      const r = await cf.sendPdf(form.id, { filename: pdfFilename(form), pdf_base64: b64, recipients: to });
      if (r?.ok) { alert(tr(L(`Sent to ${r.sent} recipient(s).`, `Envoyé à ${r.sent} destinataire(s).`))); setOpen(false); }
      else alert(cfErr(r?.error, tr));
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  if (!open) return <div onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", background: C.accentSoft, color: C.accent, borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>⤓ {tr(L("Export / Send PDF", "Exporter / Envoyer PDF"))}</div>;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{tr(L("Export / Send PDF", "Exporter / Envoyer PDF"))}</div>
        <span onClick={() => setOpen(false)} style={{ marginLeft: "auto", color: C.faint, cursor: "pointer", fontWeight: 800 }}>✕</span>
      </div>
      <div onClick={download} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, color: C.accent, cursor: "pointer" }}>⬇ {tr(L("Download PDF", "Télécharger le PDF"))}</div>
      <div style={{ ...railLbl, margin: "2px 0 0" }}>{tr(L("Email to members", "Envoyer aux membres"))}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {memberEmails.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>{tr(L("No member emails yet.", "Aucun courriel de membre."))}</div>}
        {memberEmails.map((e) => (
          <label key={e} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={!off[e]} onChange={() => setOff((s) => ({ ...s, [e]: !s[e] }))} />{e}
          </label>
        ))}
      </div>
      <div style={{ ...railLbl, margin: "2px 0 0" }}>{tr(L("Other recipients", "Autres destinataires"))}</div>
      <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={tr(L("email, email…", "courriel, courriel…"))} style={inp} />
      <div onClick={email} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "10px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : tr(L("Send PDF", "Envoyer le PDF"))}</div>
    </div>
  );
}

function fileKind(name: string, mime?: string | null): { tag: string; bg: string } {
  const n = (name || "").toLowerCase(); const m = (mime || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return { tag: "PDF", bg: "#D64545" };
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return { tag: "IMG", bg: "#2F8F6B" };
  if (/\.(xlsx?|csv|numbers)$/.test(n) || m.includes("sheet")) return { tag: "XLS", bg: "#1F7A4D" };
  if (/\.(docx?|pages|rtf)$/.test(n) || m.includes("word")) return { tag: "DOC", bg: "#2F5BA3" };
  return { tag: (n.split(".").pop() || "FILE").slice(0, 3).toUpperCase(), bg: "#8A8378" };
}
const kb = (n: number | null) => n == null ? "" : n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";

// Quorly Files — Dropbox-style per-form workspace: views · sortable table · star · share · details drawer.
const FILE_VIEWS = [
  { key: "folder" as const, en: "All files", fr: "Tous les fichiers", icon: FileText, count: "all" },
  { key: "shared" as const, en: "Shared", fr: "Partagés", icon: Share2, count: "shared" },
  { key: "starred" as const, en: "Starred", fr: "Favoris", icon: Star, count: "starred" },
  { key: "expiring" as const, en: "Expiring", fr: "Bientôt expirés", icon: CalendarClock, count: "expiring" },
  { key: "requests" as const, en: "Requests", fr: "Demandes", icon: Inbox, count: "requests" },
  { key: "deleted" as const, en: "Recently deleted", fr: "Récemment supprimés", icon: Trash2, count: "deleted" },
];

// Heuristic doc-type detection → Quorly auto-files recognized documents into a category folder
// AND offers an expiry reminder when the type typically expires.
type DocType = { expiring: boolean; en?: string; fr?: string; fEn?: string; fFr?: string };
function detectDocType(name: string): DocType {
  const n = (name || "").toLowerCase();
  const types: { re: RegExp; en: string; fr: string; fEn: string; fFr: string }[] = [
    { re: /passport|passeport/, en: "passport", fr: "passeport", fEn: "Passports", fFr: "Passeports" },
    { re: /licen[cs]e|permis|permit/, en: "licence", fr: "permis", fEn: "Licences", fFr: "Permis" },
    { re: /insurance|assurance/, en: "insurance policy", fr: "police d'assurance", fEn: "Insurance", fFr: "Assurances" },
    { re: /\bvisa\b/, en: "visa", fr: "visa", fEn: "Visas", fFr: "Visas" },
    { re: /registration|immatricul/, en: "registration", fr: "immatriculation", fEn: "Registration", fFr: "Immatriculations" },
    { re: /certificat|\bcert\b/, en: "certificate", fr: "certificat", fEn: "Certificates", fFr: "Certificats" },
    { re: /contract|contrat|lease|\bbail\b/, en: "contract", fr: "contrat", fEn: "Contracts", fFr: "Contrats" },
    { re: /identity|identit|id[-_ ]?card|carte d'id/, en: "ID document", fr: "pièce d'identité", fEn: "ID Documents", fFr: "Pièces d'identité" },
    { re: /warranty|garantie/, en: "warranty", fr: "garantie", fEn: "Warranties", fFr: "Garanties" },
    { re: /membership|abonnement|subscription/, en: "membership", fr: "abonnement", fEn: "Memberships", fFr: "Abonnements" },
  ];
  for (const t of types) if (t.re.test(n)) return { expiring: true, en: t.en, fr: t.fr, fEn: t.fEn, fFr: t.fFr };
  return { expiring: false };
}

function FilesPanel({ form, tr, lang, mobile, entries, memberOf, isVault, flat }: any) {
  const [view, setView] = useState<"folder" | "shared" | "starred" | "expiring" | "requests" | "deleted">("folder");
  const [files, setFiles] = useState<CfFile[]>([]);
  const [folders, setFolders] = useState<CfFolder[]>([]);
  const [reqs, setReqs] = useState<CfFileRequest[]>([]);
  const [dlReqs, setDlReqs] = useState<CfDownloadReq[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [cwd, setCwd] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [grid, setGrid] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "modified" | "size"; dir: 1 | -1 }>({ key: "modified", dir: -1 });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);
  const [folderDiscuss, setFolderDiscuss] = useState<CfFolder | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const openMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuFor === id) { setMenuFor(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: r.right, y: r.bottom }); setFolderMenuFor(null); setMenuFor(id);
  };
  const openFolderMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (folderMenuFor === id) { setFolderMenuFor(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: r.right, y: r.bottom }); setMenuFor(null); setFolderMenuFor(id);
  };
  const setFolderColor = async (d: CfFolder, color: string | null) => { setFolderMenuFor(null); setFolders((xs) => xs.map((x) => x.id === d.id ? { ...x, color } : x)); try { await cf.folderColor(d.id, color); } catch (e: any) { alert(e.message); load(); } };
  const [sel, setSel] = useState<CfFile | null>(null);
  const [preview, setPreview] = useState<{ file: CfFile; url?: string } | null>(null);
  const [encMode, setEncMode] = useState(false);                 // encrypt-on-upload (E2E)
  const [unlockReq, setUnlockReq] = useState<{ resolve: (k: CryptoKey) => void; reject: () => void } | null>(null);
  const e2eKeyRef = useRef<CryptoKey | null>(null);
  const [versionsFor, setVersionsFor] = useState<CfFile | null>(null);
  const [shareFor, setShareFor] = useState<CfFile | null>(null);
  const [moveFor, setMoveFor] = useState<CfFile | null>(null);
  const [sendFor, setSendFor] = useState<CfFile | null>(null);
  const [expiryFor, setExpiryFor] = useState<CfFile | null>(null);
  const [lostFor, setLostFor] = useState<CfFile | null>(null);
  const [suggest, setSuggest] = useState<{ file: CfFile; type: string; filed?: string | null } | null>(null);
  const [saveForm, setSaveForm] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const isFolderView = view === "folder";
  const folderNav = isFolderView && !flat;   // flat "Files" tab = all files, no folder navigation

  const load = useCallback(async () => {
    try {
      if (view === "requests") { const rs = await cf.fileRequests(form.id); setReqs(rs); setFiles([]); setFolders([]); }
      else if (isFolderView) {
        if (flat) { setFiles(await cf.files(form.id, null, "all")); setFolders([]); setCrumbs([]); }
        else {
          const [fs, ds] = await Promise.all([cf.files(form.id, cwd, "folder"), cf.folders(form.id, cwd)]);
          setFiles(fs); setFolders(ds);
          if (cwd) { try { setCrumbs(await cf.folderPath(cwd)); } catch { /* ignore */ } } else setCrumbs([]);
        }
      } else { setFiles(await cf.files(form.id, null, view)); setFolders([]); }
      cf.filesCounts(form.id).then(setCounts).catch(() => {});
      if (form.is_admin && form.require_download_approval) cf.downloadRequests(form.id).then(setDlReqs).catch(() => {}); else setDlReqs([]);
    } catch { /* ignore */ }
  }, [form.id, cwd, view, isFolderView, flat, form.is_admin, form.require_download_approval]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const h = () => { setMenuFor(null); setFolderMenuFor(null); }; window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  const upload = async (fl: FileList | null, requestId?: string | null) => {
    if (!fl || !fl.length) return;
    setBusy(true);
    const uploaded: { id: string; name: string }[] = [];
    // If encrypt-mode is on, unlock the E2E key once up-front (cancel aborts the whole upload).
    let encKey: CryptoKey | null = null;
    if (encMode && !requestId) { try { encKey = await ensureE2E(); } catch { setBusy(false); return; } }
    try {
      for (const f of Array.from(fl)) {
        if (f.size > 26214400) { alert(tr(L("File too large (max 25 MB): ", "Fichier trop volumineux (max 25 Mo) : ")) + f.name); continue; }
        const id = encKey
          ? await cf.fileUploadEncrypted(form.id, f, encKey, { folderId: isFolderView ? cwd : null })
          : await cf.fileUpload(form.id, f, { requestId: requestId ?? null, folderId: requestId ? null : (isFolderView ? cwd : null) });
        uploaded.push({ id, name: f.name });
      }
      // Quorly auto-files recognized documents into a category folder — only when dropping at the
      // top level (don't override a folder the user deliberately opened) and not for request uploads.
      let filedType: DocType | null = null;
      if (!requestId && isFolderView && !cwd && uploaded.length) {
        const roots = await cf.folders(form.id, null);
        const cache: Record<string, string> = {}; roots.forEach((r) => { cache[r.name.toLowerCase()] = r.id; });
        for (const u of uploaded) {
          const d = detectDocType(u.name); if (!d.expiring) continue;
          const label = tr(L(d.fEn!, d.fFr!));
          let fid = cache[label.toLowerCase()];
          if (!fid) { try { fid = await cf.folderAdd(form.id, label, null); cache[label.toLowerCase()] = fid; } catch { continue; } }
          try { await cf.fileMove(u.id, fid); if (!filedType) filedType = d; } catch { /* ignore */ }
        }
      }
      const [fresh, freshFolders] = await Promise.all([cf.files(form.id, cwd, "folder"), cf.folders(form.id, cwd)]);
      setFiles(fresh); setFolders(freshFolders); cf.filesCounts(form.id).then(setCounts).catch(() => {});
      // Offer an expiry reminder for the recognized document.
      for (const u of uploaded) {
        const d = detectDocType(u.name); if (!d.expiring) continue;
        const obj = fresh.find((x) => x.id === u.id) ?? ({ id: u.id, name: u.name, expires_at: null, reminder_days: [30, 7, 1] } as unknown as CfFile);
        setSuggest({ file: obj, type: tr(L(d.en!, d.fr!)), filed: filedType ? tr(L(filedType.fEn!, filedType.fFr!)) : null } as any); break;
      }
    } catch (e: any) { const pm = planLimitMsg(e, tr(L("en", "fr")) as "en" | "fr"); if (pm) { if (confirm(pm)) window.open("/pricing", "_blank"); } else alert(e.message); }
    setBusy(false);
  };
  // Upload a whole folder (webkitdirectory) — creates a subfolder named after the picked directory.
  const uploadFolder = async (fl: FileList | null) => {
    if (!fl || !fl.length) return;
    setBusy(true);
    try {
      const rootName = ((fl[0] as any).webkitRelativePath || "").split("/")[0] || tr(L("Uploaded folder", "Dossier"));
      let folderId: string | null = cwd;
      try { folderId = await cf.folderAdd(form.id, rootName, isFolderView ? cwd : null); } catch { folderId = cwd; }
      for (const f of Array.from(fl)) {
        if (f.size > 26214400) { alert(tr(L("File too large (max 25 MB): ", "Fichier trop volumineux (max 25 Mo) : ")) + f.name); continue; }
        await cf.fileUpload(form.id, f, { folderId });
      }
      await load();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  // Resolve the E2E key, prompting for the vault passphrase (or first-time setup) if needed.
  const ensureE2E = (): Promise<CryptoKey> => new Promise((resolve, reject) => {
    if (e2eKeyRef.current) return resolve(e2eKeyRef.current);
    setUnlockReq({ resolve: (k) => { e2eKeyRef.current = k; setUnlockReq(null); resolve(k); }, reject: () => { setUnlockReq(null); reject(new Error("cancelled")); } });
  });
  const decryptedBlob = async (f: CfFile): Promise<Blob> => {
    const key = await ensureE2E();
    const blob = await cf.fileBlob(f.path);
    return decryptToBlob(key, await blob.arrayBuffer(), f.enc_iv || "", f.mime || undefined);
  };
  const openPreview = async (f: CfFile) => {
    if (!f.encrypted) { setPreview({ file: f }); return; }
    try { const b = await decryptedBlob(f); setPreview({ file: f, url: URL.createObjectURL(b) }); } catch (e: any) { if (e.message !== "cancelled") alert(e.message); }
  };
  const download = async (f: CfFile) => {
    try {
      // Non-admins may need admin approval to download.
      if (form.require_download_approval && !form.is_admin) {
        const r = await cf.downloadRequest("file", f.id);
        if (r.status === "pending") {
          if (r.new) { cf.downloadNotify("file", f.id); alert(tr(L("Download requested — the admin has been notified. You'll be able to download once approved.", "Téléchargement demandé — l'admin a été notifié. Vous pourrez télécharger une fois approuvé."))); }
          else alert(tr(L("Your download is awaiting admin approval.", "Votre téléchargement attend l'approbation de l'admin.")));
          return;
        }
      }
      if (f.encrypted) { const b = await decryptedBlob(f); const url = URL.createObjectURL(b); const a = document.createElement("a"); a.href = url; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
      else window.open(await cf.fileUrl(f.path), "_blank");
    } catch (e: any) { if (e.message !== "cancelled") alert(e.message); }
  };
  const remove = async (f: CfFile) => { if (!confirm(tr(L("Move this file to Recently deleted?", "Déplacer ce fichier vers Récemment supprimés ?")))) return; try { await cf.fileDelete(f.id); if (sel?.id === f.id) setSel(null); await load(); } catch (e: any) { alert(e.message); } };
  const restore = async (f: CfFile) => { try { await cf.fileRestore(f.id); await load(); } catch (e: any) { alert(e.message); } };
  const purge = async (f: CfFile) => { if (!confirm(tr(L(`Permanently delete "${f.name}"? This can't be undone.`, `Supprimer définitivement « ${f.name} » ? Irréversible.`)))) return; try { await cf.filePurge(f.id); await load(); } catch (e: any) { alert(e.message); } };
  const star = async (f: CfFile) => { try { await cf.fileStar(f.id, !f.starred); setFiles((xs) => xs.map((x) => x.id === f.id ? { ...x, starred: !f.starred } : x)); cf.filesCounts(form.id).then(setCounts).catch(() => {}); if (view === "starred") load(); } catch (e: any) { alert(e.message); } };
  const cyclePriority = async (f: CfFile) => { const next = nextLevel(f.priority); setFiles((xs) => xs.map((x) => x.id === f.id ? { ...x, priority: next } : x)); try { await cf.setPriority(f.id, next); } catch (e: any) { alert(e.message); load(); } };
  const rename = async (f: CfFile) => { const n = window.prompt(tr(L("New name", "Nouveau nom")), f.name); if (n && n.trim() && n !== f.name) { try { await cf.fileRename(f.id, n.trim()); await load(); } catch (e: any) { alert(e.message); } } };
  const addReq = async () => { const l = window.prompt(tr(L("Request a file — what do you need? (e.g. Signed NDA)", "Demander un fichier — de quoi avez-vous besoin ? (ex. NDA signé)")) || ""); if (l && l.trim()) { try { await cf.fileRequestAdd(form.id, l.trim()); await load(); } catch (e: any) { alert(e.message); } } };
  const delReq = async (id: string) => { if (!confirm(tr(L("Delete this request?", "Supprimer cette demande ?")))) return; try { await cf.fileRequestDelete(id); await load(); } catch (e: any) { alert(e.message); } };
  const saveFinal = async () => { setBusy(true); try { const doc = await buildFormPdf(form, entries, memberOf, lang); const blob = doc.output("blob"); await cf.fileSavePdf(form.id, pdfFilename(form), blob); await load(); } catch (e: any) { alert(e.message); } setBusy(false); };
  const newFolder = async () => { const n = window.prompt(tr(L("New folder name", "Nom du dossier"))); if (n && n.trim()) { try { await cf.folderAdd(form.id, n.trim(), cwd); await load(); } catch (e: any) { alert(e.message); } } };
  const renameFolder = async (d: CfFolder) => { const n = window.prompt(tr(L("Rename folder", "Renommer le dossier")), d.name); if (n && n.trim() && n !== d.name) { try { await cf.folderRename(d.id, n.trim()); await load(); } catch (e: any) { alert(e.message); } } };
  const delFolder = async (d: CfFolder) => { if (!confirm(tr(L(`Delete folder "${d.name}"? Files inside move back to the top level.`, `Supprimer le dossier « ${d.name} » ? Les fichiers reviennent au niveau supérieur.`)))) return; try { await cf.folderDelete(d.id); await load(); } catch (e: any) { alert(e.message); } };

  const canEdit = (f: CfFile) => f.mine || form.is_admin;
  const activeMembers = (form.members ?? []).filter((m: any) => m.status === "active");
  const btn: any = { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: C.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
  const toggleSort = (key: "name" | "modified" | "size") => setSort((s) => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 });
  const shown = useMemo(() => {
    const arr = files.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
    return [...arr].sort((a, b) => {
      let r = 0;
      if (sort.key === "name") r = a.name.localeCompare(b.name);
      else if (sort.key === "size") r = (a.size || 0) - (b.size || 0);
      else r = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return r * sort.dir;
    });
  }, [files, q, sort]);

  // ----- Requests view (unchanged flow) -----
  const requestsView = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {form.is_admin && <span style={{ ...btn, background: C.accent, color: "#fff", borderColor: C.accent, alignSelf: "flex-start" }} onClick={addReq}><Inbox size={14} /> {tr(L("Request a file", "Demander un fichier"))}</span>}
      {reqs.length === 0 && <div style={{ color: C.faint, fontSize: 12.5 }}>{tr(L("No file requests yet.", "Aucune demande."))}</div>}
      {reqs.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FFFDF8", border: "1px solid #F0E6D2", borderRadius: 12, padding: "11px 14px" }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.label}</div><div style={{ color: C.ink2, fontSize: 11.5, marginTop: 2 }}>{r.fulfilled}/{r.total_members} {tr(L("in", "reçus"))}</div></div>
          {r.mine ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#EAF6F0", color: "#1F7A4D" }}>{tr(L("You're in", "Envoyé"))}</span>
            : <label style={{ ...btn, background: C.accent, color: "#fff", borderColor: C.accent }}>{tr(L("Upload mine", "Envoyer le mien"))}<input type="file" hidden onChange={(e) => { upload(e.target.files, r.id); e.currentTarget.value = ""; }} /></label>}
          {form.is_admin && <span onClick={() => delReq(r.id)} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><Trash2 size={15} /></span>}
        </div>
      ))}
    </div>
  );

  // ----- a file row (table on desktop, card on mobile) -----
  const AccessCell = ({ f }: { f: CfFile }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      {f.has_link && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: C.accent, background: C.accentSoft, borderRadius: 20, padding: "2px 8px" }}><Link2 size={11} /> {tr(L("Link", "Lien"))}</span>}
      {!f.has_link && (activeMembers.length ? <span style={{ display: "flex" }}>{activeMembers.slice(0, 3).map((m: any, i: number) => <span key={i} style={{ width: 20, height: 20, borderRadius: "50%", background: m.color ?? "#CCC", border: `2px solid ${C.paper}`, marginLeft: i ? -7 : 0 }} />)}{activeMembers.length > 3 && <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 700, marginLeft: 4, alignSelf: "center" }}>+{activeMembers.length - 3}</span>}</span> : <span style={{ fontSize: 11.5, color: C.faint }}>{tr(L("Only members", "Membres seulement"))}</span>)}
    </div>
  );

  const rowMenu = (f: CfFile) => {
    const kind = fileViewable(f);
    const MW = 212, MH = 360;
    const innerW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const innerH = typeof window !== "undefined" ? window.innerHeight : 800;
    const left = Math.max(8, Math.min(menuPos.x - MW, innerW - MW - 8));
    const top = (menuPos.y + MH > innerH) ? Math.max(8, innerH - MH - 8) : menuPos.y + 4;
    return (
      <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left, top, zIndex: 300, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 11, boxShadow: "0 12px 30px rgba(0,0,0,.16)", padding: 6, width: MW, maxHeight: "90vh", overflow: "auto" }}>
        {kind && <FileMenuItem icon={<Eye size={16} />} label={tr(L("Preview", "Aperçu"))} onClick={() => { setMenuFor(null); openPreview(f); }} />}
        <FileMenuItem icon={<FileText size={16} />} label={tr(L("Details & activity", "Détails & activité"))} onClick={() => { setMenuFor(null); setSel(f); }} />
        {!f.encrypted && <FileMenuItem icon={<Send size={16} />} label={tr(L("Send…", "Envoyer…"))} onClick={() => { setMenuFor(null); setSendFor(f); }} />}
        {!f.encrypted && <FileMenuItem icon={<Share2 size={16} />} label={tr(L("Share link…", "Lien de partage…"))} onClick={() => { setMenuFor(null); setShareFor(f); }} />}
        {f.encrypted && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", fontSize: 11.5, color: C.faint }}><Lock size={14} /> {tr(L("End-to-end encrypted", "Chiffré de bout en bout"))}</div>}
        <FileMenuItem icon={<CalendarClock size={16} />} label={f.expires_at ? tr(L("Change reminder…", "Modifier le rappel…")) : tr(L("Set expiry reminder…", "Définir un rappel…"))} onClick={() => { setMenuFor(null); setExpiryFor(f); }} />
        <FileMenuItem icon={<LifeBuoy size={16} />} label={tr(L("Lost it? Replacement steps", "Perdu ? Étapes de remplacement"))} onClick={() => { setMenuFor(null); setLostFor(f); }} />
        <FileMenuItem icon={<Clock size={16} />} label={tr(L("Version history", "Historique des versions"))} onClick={() => { setMenuFor(null); setVersionsFor(f); }} />
        <FileMenuItem icon={<Download size={16} />} label={tr(L("Download", "Télécharger"))} onClick={() => { setMenuFor(null); download(f); }} />
        <FileMenuItem icon={<Star size={16} />} label={f.starred ? tr(L("Remove star", "Retirer le favori")) : tr(L("Add to Starred", "Ajouter aux favoris"))} onClick={() => { setMenuFor(null); star(f); }} />
        {canEdit(f) && <FileMenuItem icon={<Pencil size={16} />} label={tr(L("Rename", "Renommer"))} onClick={() => { setMenuFor(null); rename(f); }} />}
        {canEdit(f) && <FileMenuItem icon={<FolderInput size={16} />} label={tr(L("Move to…", "Déplacer vers…"))} onClick={() => { setMenuFor(null); setMoveFor(f); }} />}
        {canEdit(f) && <FileMenuItem icon={<Trash2 size={16} />} label={tr(L("Delete", "Supprimer"))} danger onClick={() => { setMenuFor(null); remove(f); }} />}
      </div>
    );
  };

  const folderMenu = (d: CfFolder) => {
    const MW = 220, MH = 250;
    const innerW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const innerH = typeof window !== "undefined" ? window.innerHeight : 800;
    const left = Math.max(8, Math.min(menuPos.x - MW, innerW - MW - 8));
    const top = (menuPos.y + MH > innerH) ? Math.max(8, innerH - MH - 8) : menuPos.y + 4;
    return (
      <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left, top, zIndex: 300, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 11, boxShadow: "0 12px 30px rgba(0,0,0,.16)", padding: 6, width: MW }}>
        <FileMenuItem icon={<Eye size={16} />} label={tr(L("Open", "Ouvrir"))} onClick={() => { setFolderMenuFor(null); setCwd(d.id); }} />
        <FileMenuItem icon={<MessageSquare size={16} />} label={tr(L("Discussion & vote", "Discussion & vote"))} onClick={() => { setFolderMenuFor(null); setFolderDiscuss(d); }} />
        <FileMenuItem icon={<Pencil size={16} />} label={tr(L("Rename", "Renommer"))} onClick={() => { setFolderMenuFor(null); renameFolder(d); }} />
        <div style={{ padding: "8px 11px 6px" }}>
          <div style={{ fontSize: 11, color: C.faint, fontWeight: 800, marginBottom: 7 }}>{tr(L("Colour", "Couleur"))}</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {FOLDER_COLORS.map((c) => <span key={c} onClick={() => setFolderColor(d, c)} style={{ width: 20, height: 20, borderRadius: 6, background: c, cursor: "pointer", border: (d.color || "#E0A83B") === c ? "2px solid #1C1B19" : "2px solid transparent" }} />)}
            <span onClick={() => setFolderColor(d, null)} title={tr(L("Reset", "Réinitialiser"))} style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${C.line}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.faint }}>×</span>
          </div>
        </div>
        <FileMenuItem icon={<Trash2 size={16} />} label={tr(L("Delete", "Supprimer"))} danger onClick={() => { setFolderMenuFor(null); delFolder(d); }} />
      </div>
    );
  };

  const nameCell = (f: CfFile, k: { tag: string; bg: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
      {view !== "deleted" && (() => { const lv = effLevel(f); const col = lv ? PRIO_COLOR[lv] : "#D9CFBE"; const label = lv ? tr(L({ urgent: "Urgent", important: "Important", normal: "Normal" }[lv], { urgent: "Urgent", important: "Important", normal: "Normal" }[lv])) + (f.priority ? "" : " " + tr(L("(auto)", "(auto)"))) : tr(L("Set priority", "Définir la priorité")); return <span onClick={(e) => { e.stopPropagation(); cyclePriority(f); }} title={label} style={{ display: "flex", cursor: "pointer", color: col, flex: "0 0 auto" }}><Star size={16} fill={lv ? col : "none"} /></span>; })()}
      <span onClick={(e) => { e.stopPropagation(); fileViewable(f) && openPreview(f); }} style={{ width: 32, height: 32, borderRadius: 8, background: k.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flex: "0 0 auto", cursor: fileViewable(f) ? "pointer" : "default" }}>{k.tag}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}
          {f.encrypted && <Lock size={11} style={{ color: C.accent, marginLeft: 5, verticalAlign: "middle" }} />}
          {(f.version ?? 1) > 1 && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 20, background: "#FBF1E0", color: "#B4801F", marginLeft: 6 }}>v{f.version}</span>}
          {f.is_final && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "#EAF6F0", color: "#1F7A4D", marginLeft: 6 }}>{tr(L("Final", "Final"))}</span>}
          {(() => { const ex = expiryInfo(f, tr); return ex ? <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: ex.bg, color: ex.fg, marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><CalendarClock size={10} /> {ex.label}</span> : null; })()}
          {f.decided && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "#EAF6F0", color: "#1F7A4D", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><CheckCircle2 size={10} /> {tr(L("Approved", "Approuvé"))}</span>}
          {!f.decided && (f.approvals ?? 0) > 0 && <span title={tr(L("Under review", "En cours de décision"))} style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "#EEEFF9", color: "#2F3AA3", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><ThumbsUp size={10} /> {f.approvals}</span>}</div>
        {mobile && <div style={{ color: C.faint, fontSize: 11, marginTop: 1 }}>{f.uploader_name}{f.size != null ? " · " + kb(f.size) : ""} · {fmtDate(f.created_at, lang)}</div>}
      </div>
    </div>
  );

  const cols = "minmax(0,1fr) 132px 104px 78px 34px";
  const th: any = { display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, letterSpacing: .3, textTransform: "uppercase", color: C.faint, cursor: "pointer" };
  const sortIcon = (key: string) => sort.key === key ? (sort.dir === 1 ? <ChevronUpTiny /> : <ChevronDown size={12} />) : null;

  const decideDl = async (id: string, ok: boolean) => { try { await cf.downloadDecide(id, ok); setDlReqs((xs) => xs.filter((r) => r.id !== id)); } catch (e: any) { alert(e.message); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
      {/* Admin: pending download approvals */}
      {form.is_admin && dlReqs.length > 0 && (
        <div style={{ background: "#FBF1E0", border: "1px solid #F0E0C0", borderRadius: 12, padding: "11px 13px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .3, textTransform: "uppercase", color: "#B4801F", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Download size={13} /> {tr(L("Download requests", "Demandes de téléchargement"))} · {dlReqs.length}</div>
          {dlReqs.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.requester_color ?? "#CCC", flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}><b style={{ fontWeight: 800 }}>{r.requester_name}</b> → <span style={{ color: C.ink2 }}>{r.file_name}</span></div>
              <span onClick={() => decideDl(r.id, true)} style={{ fontSize: 11.5, fontWeight: 800, color: "#1F7A4D", cursor: "pointer" }}>{tr(L("Approve", "Approuver"))}</span>
              <span onClick={() => decideDl(r.id, false)} style={{ fontSize: 11.5, fontWeight: 800, color: "#B4531F", cursor: "pointer" }}>{tr(L("Deny", "Refuser"))}</span>
            </div>
          ))}
        </div>
      )}
      {/* view switcher (Dropbox sidebar → segmented pills) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILE_VIEWS.map((v) => {
          const on = view === v.key; const Ic = v.icon; const c = counts?.[v.count];
          return (
            <span key={v.key} onClick={() => { setView(v.key); setCwd(null); setSel(null); setQ(""); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: `1px solid ${on ? "#dfe1f4" : C.line}`, background: on ? C.accentSoft : "#fff", color: on ? C.accent : C.ink2 }}>
              <Ic size={14} /> {v.key === "folder" ? tr(L(folderNav ? "All folders" : "All files", folderNav ? "Tous les dossiers" : "Tous les fichiers")) : tr(L(v.en, v.fr))}{c ? <span style={{ fontSize: 10.5, color: on ? C.accent : C.faint }}>{c}</span> : null}
            </span>
          );
        })}
      </div>

      {/* Quorly noticed an expiring document type → offer a reminder */}
      {suggest && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#FBF1E0", border: "1px solid #F0E0C0", borderRadius: 12, padding: "11px 13px" }}>
          <CalendarClock size={20} style={{ color: "#B4801F", flex: "0 0 auto" }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#7A5A12" }}>
            <b>{tr(L(`This looks like a ${suggest.type}.`, `Ceci ressemble à un ${suggest.type}.`))}</b>{suggest.filed ? " " + tr(L(`Filed under ${suggest.filed}.`, `Classé dans ${suggest.filed}.`)) : ""} {tr(L("Documents like this often expire — want a renewal reminder?", "Ce type de document expire souvent — voulez-vous un rappel de renouvellement ?"))}
          </div>
          <span onClick={() => { setExpiryFor(suggest.file); setSuggest(null); }} style={{ background: "#B4801F", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{tr(L("Set reminder", "Définir un rappel"))}</span>
          <span onClick={() => setSuggest(null)} style={{ color: "#B4801F", cursor: "pointer", display: "flex" }}><X size={16} /></span>
        </div>
      )}

      {view === "requests" ? requestsView : <>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {folderNav && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: C.ink2, flex: 1, minWidth: 120, flexWrap: "wrap" }}>
            <span onClick={() => setCwd(null)} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: cwd ? C.accent : C.ink }}><Home size={14} /> {tr(L("All files", "Tous les fichiers"))}</span>
            {crumbs.map((c, i) => <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><ChevronRight size={13} style={{ color: C.faint }} /><span onClick={() => i < crumbs.length - 1 && setCwd(c.id)} style={{ cursor: i < crumbs.length - 1 ? "pointer" : "default", color: i < crumbs.length - 1 ? C.accent : C.ink }}>{c.name}</span></span>)}
          </div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: isFolderView ? 0 : "auto", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 10px", color: C.faint, flex: mobile ? 1 : "0 1 220px", minWidth: 120 }}>
            <Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(L("Search files…", "Rechercher…"))} style={{ border: 0, outline: 0, background: "transparent", fontSize: 12.5, color: C.ink, width: "100%" }} />
          </div>
          {!mobile && <span style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 9, overflow: "hidden" }}>
            <span onClick={() => setGrid(false)} style={{ padding: "8px 9px", background: grid ? "#fff" : C.accentSoft, color: grid ? C.ink2 : C.accent, cursor: "pointer", display: "flex" }}><List size={16} /></span>
            <span onClick={() => setGrid(true)} style={{ padding: "8px 9px", background: grid ? C.accentSoft : "#fff", color: grid ? C.accent : C.ink2, cursor: "pointer", display: "flex", borderLeft: `1px solid ${C.line}` }}><LayoutGrid size={16} /></span>
          </span>}
          {folderNav && <span style={btn} onClick={newFolder}><FolderPlus size={14} /> {!mobile && tr(L("New folder", "Dossier"))}</span>}
          {folderNav && <span style={btn} onClick={() => folderInputRef.current?.click()} title={tr(L("Upload a whole folder", "Téléverser un dossier entier"))}><Upload size={14} /> {!mobile && tr(L("Upload folder", "Dossier"))}</span>}
          <input ref={folderInputRef} type="file" hidden multiple {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => { uploadFolder(e.target.files); e.currentTarget.value = ""; }} />
          {isVault && folderNav && <span style={btn} onClick={() => setSaveForm(true)} title={tr(L("Save one of your forms here", "Enregistrer un de vos formulaires ici"))}><FileText size={14} /> {!mobile && tr(L("Save a form", "Enregistrer un formulaire"))}</span>}
          {!isVault && form.is_admin && folderNav && <span style={btn} onClick={busy ? undefined : saveFinal} title={tr(L("Save form PDF here", "Enregistrer le PDF ici"))}><FileText size={14} /> {!mobile && tr(L("Save PDF", "PDF"))}</span>}
          {isFolderView && <span onClick={() => setEncMode((m) => !m)} title={tr(L("Encrypt uploads end-to-end — only you can open them", "Chiffrer les envois de bout en bout — vous seul pouvez les ouvrir"))} style={{ ...btn, background: encMode ? C.accent : "#fff", color: encMode ? "#fff" : C.ink, borderColor: encMode ? C.accent : C.line }}><Lock size={14} /> {!mobile && tr(L("Encrypt", "Chiffrer"))}</span>}
          {view !== "deleted" && <span style={{ ...btn, background: C.accent, color: "#fff", borderColor: C.accent }} onClick={() => inputRef.current?.click()}><Upload size={14} /> {tr(L("Upload", "Téléverser"))}</span>}
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.currentTarget.value = ""; }} />
        </div>

        {view === "deleted" && <div style={{ fontSize: 11.5, color: C.ink2, background: "#FCF8F0", border: "1px solid #F0E6D2", borderRadius: 10, padding: "9px 12px" }}>{tr(L("Deleted files can be restored here. Delete forever to remove them permanently.", "Les fichiers supprimés peuvent être restaurés ici. Supprimez définitivement pour les retirer."))}</div>}

        {/* dropzone — folder view only */}
        {isFolderView && <div onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          style={{ border: `1.6px dashed ${drag ? C.accent : "#d9d2c6"}`, background: drag ? C.accentSoft : "#FCFBF8", borderRadius: 12, padding: 13, textAlign: "center", cursor: "pointer", color: C.ink2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 13, color: C.ink }}><Upload size={15} style={{ color: C.accent }} />{busy ? tr(L("Uploading…", "Téléversement…")) : tr(L("Drag files here, or click to browse", "Glissez des fichiers ici, ou cliquez"))}{cwd ? " · " + tr(L("into this folder", "dans ce dossier")) : ""}</span>
        </div>}

        {/* Priority legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10.5, color: C.faint, padding: "0 2px", flexWrap: "wrap" }}>
          {([["urgent", tr(L("Urgent", "Urgent"))], ["important", tr(L("Important", "Important"))], ["normal", tr(L("Normal", "Normal"))]] as const).map(([lv, lbl]) => (
            <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={11} fill={PRIO_COLOR[lv]} style={{ color: PRIO_COLOR[lv] }} /> {lbl}</span>
          ))}
          <span>· {tr(L("auto from expiry — tap a star to override", "auto selon l'expiration — toucher pour changer"))}</span>
        </div>

        {/* GRID view */}
        {grid && !mobile ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            {folderNav && folders.map((d) => (
              <div key={d.id} onClick={() => setCwd(d.id)} style={{ position: "relative", border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: "#fff", cursor: "pointer" }}>
                {d.decided && <CheckCircle2 size={15} style={{ color: "#1F7A4D", position: "absolute", top: 12, right: 12 }} />}
                <Folder size={30} style={{ color: d.color || "#E0A83B" }} /><div style={{ fontWeight: 700, fontSize: 13, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div><div style={{ fontSize: 11, color: C.faint }}>{d.files} {tr(L("files", "fichiers"))}</div>
              </div>
            ))}
            {shown.map((f) => { const k = fileKind(f.name, f.mime); return (
              <div key={f.id} onClick={() => openPreview(f)} style={{ border: `1px solid ${sel?.id === f.id ? "#dfe1f4" : C.line}`, borderRadius: 12, padding: 14, background: sel?.id === f.id ? C.accentSoft : "#fff", cursor: "pointer", position: "relative" }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: k.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{k.tag}</span>
                {(() => { const lv = effLevel(f); return lv ? <Star size={14} fill={PRIO_COLOR[lv]} style={{ color: PRIO_COLOR[lv], position: "absolute", top: 12, right: 12 }} /> : null; })()}
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{kb(f.size ?? null)} · {fmtDate(f.created_at, lang)}</div>
              </div>
            ); })}
          </div>
        ) : (
          <div>
            {/* table header (desktop) */}
            {!mobile && <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center", padding: "0 8px 8px", borderBottom: `1px solid ${C.line}` }}>
              <div style={th} onClick={() => toggleSort("name")}>{tr(L("Name", "Nom"))} {sortIcon("name")}</div>
              <div style={{ ...th, cursor: "default" }}>{tr(L("Who can access", "Qui a accès"))}</div>
              <div style={th} onClick={() => toggleSort("modified")}>{tr(L("Modified", "Modifié"))} {sortIcon("modified")}</div>
              <div style={th} onClick={() => toggleSort("size")}>{tr(L("Size", "Taille"))} {sortIcon("size")}</div>
              <div />
            </div>}

            {/* folder rows (folder view) */}
            {folderNav && folders.map((d) => (
              <div key={d.id} style={{ position: "relative", display: "grid", gridTemplateColumns: mobile ? "1fr auto" : cols, gap: 10, alignItems: "center", padding: "11px 8px", borderBottom: `1px solid ${C.line2}`, cursor: "pointer" }} onClick={() => setCwd(d.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  {!mobile && <span style={{ width: 16 }} />}
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: d.color || "#E0A83B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Folder size={17} /></span>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}
                    {d.decided && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "#EAF6F0", color: "#1F7A4D", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><CheckCircle2 size={10} /> {tr(L("Approved", "Approuvé"))}</span>}
                    {!d.decided && (d.approvals ?? 0) > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "#EEEFF9", color: "#2F3AA3", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><ThumbsUp size={10} /> {d.approvals}</span>}</div>{mobile && <div style={{ fontSize: 11, color: C.faint }}>{d.files} {tr(L("files", "fichiers"))}</div>}</div>
                </div>
                {!mobile && <><div style={{ fontSize: 11.5, color: C.faint }}>—</div><div style={{ fontSize: 12, color: C.faint }}>—</div><div style={{ fontSize: 12, color: C.faint }}>{d.files} {tr(L("items", "élém."))}</div></>}
                {form.is_admin ? <div style={{ display: "flex", justifyContent: "flex-end" }}><span onClick={(e) => openFolderMenu(d.id, e)} style={{ color: C.faint, cursor: "pointer", display: "flex", padding: 3 }}><MoreVertical size={18} /></span></div> : <div />}
                {folderMenuFor === d.id && folderMenu(d)}
              </div>
            ))}

            {/* file rows */}
            {shown.length === 0 && folders.length === 0 && <div style={{ color: C.faint, fontSize: 12.5, padding: "16px 8px" }}>{q ? tr(L("No matches.", "Aucun résultat.")) : view === "deleted" ? tr(L("Nothing in Recently deleted.", "Rien dans Récemment supprimés.")) : view === "starred" ? tr(L("No starred files yet.", "Aucun favori.")) : view === "shared" ? tr(L("No shared files yet.", "Aucun fichier partagé.")) : tr(L("Nothing here yet.", "Rien ici pour l'instant."))}</div>}
            {shown.map((f) => { const k = fileKind(f.name, f.mime); return (
              <div key={f.id} onClick={() => view !== "deleted" && openPreview(f)} style={{ position: "relative", display: "grid", gridTemplateColumns: mobile ? "1fr auto" : cols, gap: 10, alignItems: "center", padding: "11px 8px", borderBottom: `1px solid ${C.line2}`, cursor: view === "deleted" ? "default" : "pointer", background: sel?.id === f.id ? C.accentSoft : "transparent", borderRadius: sel?.id === f.id ? 8 : 0 }}>
                {nameCell(f, k)}
                {!mobile && <AccessCell f={f} />}
                {!mobile && <div style={{ fontSize: 12, color: C.ink2 }}>{fmtDate(f.created_at, lang)}</div>}
                {!mobile && <div style={{ fontSize: 12, color: C.ink2 }}>{kb(f.size ?? null)}</div>}
                {view === "deleted"
                  ? <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}><span onClick={(e) => { e.stopPropagation(); restore(f); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.accent, fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}><RotateCcw size={13} /> {!mobile && tr(L("Restore", "Restaurer"))}</span>{canEdit(f) && <span onClick={(e) => { e.stopPropagation(); purge(f); }} style={{ color: "#B4531F", cursor: "pointer", display: "flex" }}><Trash2 size={15} /></span>}</div>
                  : <div style={{ display: "flex", justifyContent: "flex-end" }}><span onClick={(e) => openMenu(f.id, e)} style={{ color: C.faint, cursor: "pointer", display: "flex", padding: 3 }}><MoreVertical size={18} /></span></div>}
                {menuFor === f.id && rowMenu(f)}
              </div>
            ); })}
          </div>
        )}
      </>}

      {sel && <DetailsDrawer file={sel} form={form} tr={tr} lang={lang} activeMembers={activeMembers} onClose={() => setSel(null)}
        onPreview={() => openPreview(sel)} onShare={() => setShareFor(sel)} onVersions={() => setVersionsFor(sel)} onMove={() => setMoveFor(sel)} onSend={() => setSendFor(sel)} onExpiry={() => setExpiryFor(sel)}
        onDownload={() => download(sel)} onRename={() => rename(sel)} onDelete={() => remove(sel)} onStar={() => star(sel)} canEdit={canEdit(sel)} />}
      {preview && <PreviewModal file={preview.file} overrideUrl={preview.url} tr={tr} onClose={() => { if (preview.url) URL.revokeObjectURL(preview.url); setPreview(null); }} onDownload={() => download(preview.file)} />}
      {unlockReq && <UnlockModal tr={tr} onKey={unlockReq.resolve} onCancel={unlockReq.reject} />}
      {versionsFor && <VersionsModal file={versionsFor} form={form} tr={tr} lang={lang} onClose={() => setVersionsFor(null)} onChanged={load} />}
      {shareFor && <ShareModal file={shareFor} tr={tr} onClose={() => { setShareFor(null); load(); }} />}
      {moveFor && <MoveModal file={moveFor} form={form} tr={tr} onClose={() => setMoveFor(null)} onMoved={() => { setMoveFor(null); load(); }} />}
      {sendFor && <SendModal file={sendFor} tr={tr} onClose={() => setSendFor(null)} />}
      {expiryFor && <ExpiryModal file={expiryFor} tr={tr} lang={lang} onClose={() => setExpiryFor(null)} onSaved={() => { setExpiryFor(null); load(); }} />}
      {lostFor && <LostDocModal file={lostFor} tr={tr} lang={lang} onClose={() => setLostFor(null)} />}
      {folderDiscuss && modalShell(<>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Folder size={17} style={{ color: folderDiscuss.color || "#E0A83B" }} /> {folderDiscuss.name}</div>
          <span onClick={() => setFolderDiscuss(null)} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
        </div>
        <div style={{ padding: 16, overflow: "auto" }}><DiscussionPanel type="folder" id={folderDiscuss.id} tr={tr} lang={lang} /></div>
      </>, () => setFolderDiscuss(null), 460)}
      {saveForm && <SaveFormModal vaultId={form.id} tr={tr} lang={lang} memberOf={memberOf} onClose={() => setSaveForm(false)} onSaved={() => { setSaveForm(false); load(); }} />}
    </div>
  );
}

function ChevronUpTiny() { return <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} />; }

function ReceiptEditForm({ r, url, tr, lang, onSave, onDelete, onOpen }: any) {
  const [merchant, setMerchant] = useState(r.merchant || ""); const [date, setDate] = useState(r.purchase_date || "");
  const [category, setCategory] = useState(r.category || "Other");
  const [subtotal, setSubtotal] = useState(r.subtotal ?? ""); const [tax, setTax] = useState(r.tax ?? ""); const [total, setTotal] = useState(r.total ?? "");
  const [aligns, setAligns] = useState(r.aligns_with || ""); const [busy, setBusy] = useState(false);
  const num = (v: any) => v === "" || v == null ? null : Number(v);
  const confirm = async () => { setBusy(true); try { await onSave({ merchant, date: date || null, category, subtotal: num(subtotal), tax: num(tax), total: num(total), aligns, status: "confirmed" }); } catch (e: any) { alert(e.message); } setBusy(false); };
  const fld: any = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#FCFBF8", width: "100%", boxSizing: "border-box" };
  const lbl: any = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3, color: C.faint, marginBottom: 3 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 16 }}>
      <div>
        <div style={{ background: "#20242e", borderRadius: 10, height: 210, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{url ? (isPdfPath(r.image_path) ? <iframe title="receipt" src={url} style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} /> : <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />) : <Receipt size={34} style={{ color: "#8b93a7" }} />}</div>
        {url && (onOpen ? <span onClick={() => onOpen()} style={{ fontSize: 10.5, color: C.accent, fontWeight: 700, display: "block", textAlign: "center", marginTop: 6, cursor: "pointer" }}>{tr(L("Open original", "Voir l'original"))}</span> : <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: C.accent, fontWeight: 700, display: "block", textAlign: "center", marginTop: 6, textDecoration: "none" }}>{tr(L("Open original", "Voir l'original"))}</a>)}
      </div>
      <div>
        {r.status === "review" && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EFEAF7", color: "#6B4FA3", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 800, marginBottom: 8 }}><Sparkles size={12} /> {tr(L("Read by Quorly — confirm", "Lu par Quorly — confirmez"))}</div>}
        <div style={{ marginBottom: 8 }}><div style={lbl}>{tr(L("Merchant", "Marchand"))}</div><input value={merchant} onChange={(e) => setMerchant(e.target.value)} style={fld} /></div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, marginBottom: 8 }}><div style={lbl}>{tr(L("Date", "Date"))}</div><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fld} /></div>
          <div style={{ flex: 1, marginBottom: 8 }}><div style={lbl}>{tr(L("Category", "Catégorie"))}</div><select value={category} onChange={(e) => setCategory(e.target.value)} style={fld}>{RCAT.map((c) => <option key={c} value={c}>{rcat(c, lang)}</option>)}</select></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, marginBottom: 8 }}><div style={lbl}>{tr(L("Subtotal", "Sous-total"))}</div><input inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} style={fld} /></div>
          <div style={{ flex: 1, marginBottom: 8 }}><div style={lbl}>{tr(L("Tax", "Taxe"))}</div><input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} style={fld} /></div>
          <div style={{ flex: 1, marginBottom: 8 }}><div style={lbl}>{tr(L("Total", "Total"))}</div><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} style={{ ...fld, fontWeight: 800, color: C.accent }} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><div style={lbl}>{tr(L("Aligns with (PO / purchase)", "Rattaché à (BC / achat)"))}</div><input value={aligns} onChange={(e) => setAligns(e.target.value)} placeholder={tr(L("optional", "optionnel"))} style={fld} /></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={confirm} disabled={busy} style={{ flex: 1, background: C.accent, color: "#fff", border: 0, borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? .6 : 1 }}><CheckCircle2 size={15} /> {tr(L("Confirm", "Confirmer"))}</button>
          <span onClick={() => onDelete()} style={{ border: `1px solid ${C.line}`, color: "#B4531F", borderRadius: 9, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={15} /></span>
        </div>
      </div>
    </div>
  );
}

// Smart receipts — three user-selectable views (Ledger / Dashboard / Scan & review).
function ReceiptsPanel({ form, tr, lang, mobile }: any) {
  const [recs, setRecs] = useState<CfReceipt[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [rview, setRview] = useState<"ledger" | "dashboard" | "scan">(() => (typeof window !== "undefined" && (localStorage.getItem("quorly-rview") as any)) || "ledger");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<CfReceipt | null>(null);
  const [scanSel, setScanSel] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false); const [emailTo, setEmailTo] = useState(""); const [emailMsg, setEmailMsg] = useState(""); const [sending, setSending] = useState(false);
  const [dlReqs, setDlReqs] = useState<CfDownloadReq[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setView = (v: "ledger" | "dashboard" | "scan") => { setRview(v); try { localStorage.setItem("quorly-rview", v); } catch { /* ignore */ } };

  const load = useCallback(async () => {
    try {
      const rs = await cf.receipts(form.id); setRecs(rs);
      const u: Record<string, string> = {};
      await Promise.all(rs.filter((r) => r.image_path).map(async (r) => { try { u[r.id] = await cf.fileUrl(r.image_path!); } catch { /* ignore */ } }));
      setUrls(u);
      setScanSel((prev) => prev && rs.some((r) => r.id === prev) ? prev : (rs.find((r) => r.status === "review")?.id ?? rs[0]?.id ?? null));
      if (form.is_admin && form.require_download_approval) cf.downloadRequests(form.id).then(setDlReqs).catch(() => {}); else setDlReqs([]);
    } catch { /* ignore */ }
  }, [form.id, form.is_admin, form.require_download_approval]);
  useEffect(() => { load(); }, [load]);

  const readFileB64 = (file: File) => new Promise<{ b64: string; mime: string }>((res, rej) => { const fr = new FileReader(); fr.onload = () => { const s = String(fr.result); res({ b64: s.split(",")[1] || "", mime: file.type }); }; fr.onerror = rej; fr.readAsDataURL(file); });
  const upload = async (fl: FileList | null) => {
    if (!fl || !fl.length) return; setBusy(true);
    try {
      for (const file of Array.from(fl)) {
        if (file.size > 26214400) { alert(tr(L("File too large (max 25 MB).", "Fichier trop volumineux (max 25 Mo)."))); continue; }
        let fields: any = {};
        if (/^image\//.test(file.type) || file.type === "application/pdf") { try { const { b64, mime } = await readFileB64(file); fields = await cf.readReceipt(b64, mime); } catch { /* AI optional */ } }
        const path = await cf.uploadReceiptImage(form.id, file);
        await cf.receiptAdd(form.id, { merchant: fields.merchant ?? null, date: fields.date ?? null, category: fields.category ?? null, subtotal: fields.subtotal ?? null, tax: fields.tax ?? null, total: fields.total ?? null, currency: fields.currency ?? "CAD", image_path: path, status: "review" });
      }
      await load();
    } catch (e: any) { const pm = planLimitMsg(e, lang); if (pm) { if (confirm(pm)) window.open("/pricing", "_blank"); } else alert(e.message); }
    setBusy(false);
  };
  const save = async (r: CfReceipt, patch: any) => { await cf.receiptUpdate(r.id, patch); await load(); };
  const del = async (r: CfReceipt) => { if (!confirm(tr(L("Delete this receipt?", "Supprimer ce reçu ?")))) return; try { await cf.receiptDelete(r.id); setEdit(null); await load(); } catch (e: any) { alert(e.message); } };
  const fname = (ext: string) => `${(form.name || "receipts").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-receipts.${ext}`;
  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [L("Merchant", "Marchand"), L("Date", "Date"), L("Category", "Catégorie"), L("Subtotal", "Sous-total"), L("Tax", "Taxe"), L("Total", "Total"), L("Currency", "Devise"), L("Aligns with", "Rattaché à")].map(tr);
    const lines = [head.map(esc).join(",")];
    recs.forEach((r) => lines.push([r.merchant, r.purchase_date, rcat(r.category, lang), r.subtotal, r.tax, r.total, r.currency, r.aligns_with].map(esc).join(",")));
    lines.push(""); lines.push(["", "", tr(L("Grand total", "Total général")), "", taxTotal.toFixed(2), grand.toFixed(2), cur, ""].map(esc).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname("csv"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const exportPdf = async () => { try { const { buildReceiptsPdf } = await import("@/lib/pdf"); const doc = await buildReceiptsPdf(form.name, recs, lang); doc.save(fname("pdf")); } catch (e: any) { alert(e.message); } };
  const sendReport = async () => {
    const emails = emailTo.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) { alert(tr(L("Enter at least one email.", "Entrez au moins un courriel."))); return; }
    setSending(true);
    try {
      const { buildReceiptsPdf } = await import("@/lib/pdf");
      const doc = await buildReceiptsPdf(form.name, recs, lang);
      const b64 = doc.output("datauristring").split(",")[1];
      const msg = emailMsg.trim() || tr(L(`Expense report — ${recs.length} receipts · grand total ${money(grand, cur, lang)}.`, `Note de frais — ${recs.length} reçus · total ${money(grand, cur, lang)}.`));
      const r = await cf.sendPdf(form.id, { filename: fname("pdf"), pdf_base64: b64, recipients: emails, message: msg });
      if (r?.ok) { alert(tr(L(`Sent to ${r.sent} recipient(s).`, `Envoyé à ${r.sent} destinataire(s).`))); setEmailOpen(false); setEmailTo(""); setEmailMsg(""); }
      else alert(cfErr(r?.error, tr));
    } catch (e: any) { alert(e.message); }
    setSending(false);
  };
  const decideDl = async (id: string, ok: boolean) => { try { await cf.downloadDecide(id, ok); setDlReqs((xs) => xs.filter((r) => r.id !== id)); } catch (e: any) { alert(e.message); } };
  const openOriginal = async (r: CfReceipt) => {
    try {
      if (form.require_download_approval && !form.is_admin) {
        const res = await cf.downloadRequest("receipt", r.id);
        if (res.status === "pending") { if (res.new) { cf.downloadNotify("receipt", r.id); alert(tr(L("Requested — the admin has been notified. Available once approved.", "Demandé — l'admin a été notifié. Disponible après approbation."))); } else alert(tr(L("Awaiting admin approval.", "En attente d'approbation de l'admin."))); return; }
      }
      const url = urls[r.id] || (r.image_path ? await cf.fileUrl(r.image_path) : null);
      if (url) window.open(url, "_blank");
    } catch (e: any) { alert(e.message); }
  };

  const grand = recs.reduce((s, r) => s + (r.total || 0), 0);
  const taxTotal = recs.reduce((s, r) => s + (r.tax || 0), 0);
  const byCat: Record<string, number> = {}; recs.forEach((r) => { const c = r.category || "Other"; byCat[c] = (byCat[c] || 0) + (r.total || 0); });
  const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  const cur = recs[0]?.currency || "CAD";
  const chip = (c: string | null) => <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: (RCAT_COLOR[c || "Other"] || "#8A8378") + "22", color: RCAT_COLOR[c || "Other"] || "#8A8378" }}>{rcat(c, lang)}</span>;
  const seg: any = (v: string, label: string, Ic: any) => <span onClick={() => setView(v as any)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: `1px solid ${rview === v ? "#dfe1f4" : C.line}`, background: rview === v ? C.accentSoft : "#fff", color: rview === v ? C.accent : C.ink2 }}><Ic size={14} /> {label}</span>;
  const scanR = recs.find((r) => r.id === scanSel);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {form.is_admin && dlReqs.length > 0 && (
        <div style={{ background: "#FBF1E0", border: "1px solid #F0E0C0", borderRadius: 12, padding: "11px 13px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .3, textTransform: "uppercase", color: "#B4801F", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Download size={13} /> {tr(L("Download requests", "Demandes de téléchargement"))} · {dlReqs.length}</div>
          {dlReqs.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.requester_color ?? "#CCC", flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}><b style={{ fontWeight: 800 }}>{r.requester_name}</b> → <span style={{ color: C.ink2 }}>{r.file_name}</span></div>
              <span onClick={() => decideDl(r.id, true)} style={{ fontSize: 11.5, fontWeight: 800, color: "#1F7A4D", cursor: "pointer" }}>{tr(L("Approve", "Approuver"))}</span>
              <span onClick={() => decideDl(r.id, false)} style={{ fontSize: 11.5, fontWeight: 800, color: "#B4531F", cursor: "pointer" }}>{tr(L("Deny", "Refuser"))}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {seg("ledger", tr(L("Ledger", "Registre")), List)}
        {seg("dashboard", tr(L("Dashboard", "Tableau")), LayoutGrid)}
        {seg("scan", tr(L("Scan & review", "Numériser")), Sparkles)}
        {recs.length > 0 && <span onClick={exportCsv} style={{ marginLeft: "auto", border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 800, color: C.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Download size={13} /> CSV</span>}
        {recs.length > 0 && <span onClick={exportPdf} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 800, color: C.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Download size={13} /> PDF</span>}
        {recs.length > 0 && form.is_admin && <span onClick={() => setEmailOpen(true)} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 800, color: C.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Send size={13} /> {tr(L("Email", "Courriel"))}</span>}
        <span style={{ marginLeft: recs.length > 0 ? 0 : "auto", display: "inline-flex", alignItems: "center", gap: 6, background: C.accent, color: "#fff", borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }} onClick={() => inputRef.current?.click()}><Upload size={14} /> {busy ? tr(L("Reading…", "Lecture…")) : tr(L("Upload receipts", "Ajouter des reçus"))}</span>
        <input ref={inputRef} type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { upload(e.target.files); e.currentTarget.value = ""; }} />
      </div>

      {recs.length === 0 && <div style={{ border: `1.6px dashed #d9d2c6`, background: "#FCFBF8", borderRadius: 13, padding: 30, textAlign: "center", color: C.ink2 }}><Sparkles size={22} style={{ color: C.accent, margin: "0 auto 6px" }} /><div style={{ fontWeight: 800, fontSize: 14 }}>{tr(L("Upload a receipt — Quorly reads the merchant, date, tax & total", "Ajoutez un reçu — Quorly lit le marchand, la date, la taxe et le total"))}</div></div>}

      {/* LEDGER */}
      {rview === "ledger" && recs.length > 0 && <div>
        {cats.map((c) => <div key={c}>
          <div style={{ display: "flex", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: C.faint, padding: "12px 6px 5px" }}>{rcat(c, lang)}<span style={{ marginLeft: "auto", color: C.ink, fontVariantNumeric: "tabular-nums" }}>{money(byCat[c], cur, lang)}</span></div>
          {recs.filter((r) => (r.category || "Other") === c).map((r) => (
            <div key={r.id} onClick={() => setEdit(r)} style={{ display: "grid", gridTemplateColumns: mobile ? "44px 1fr auto" : "48px 1fr 92px 96px", gap: 10, alignItems: "center", padding: "9px 6px", borderBottom: `1px solid ${C.line2}`, cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "#f3efe7", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{urls[r.id] && !isPdfPath(r.image_path) ? <img src={urls[r.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Receipt size={16} style={{ color: C.faint }} />}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.merchant || tr(L("(unread)", "(non lu)"))} {r.status === "review" && <Sparkles size={11} style={{ color: "#6B4FA3", display: "inline", verticalAlign: "middle" }} />}</div><div style={{ fontSize: 11, color: C.faint }}>{r.tax != null ? tr(L("Tax", "Taxe")) + " " + money(r.tax, cur, lang) : ""}{r.aligns_with ? " · " + r.aligns_with : ""}</div></div>
              {!mobile && <div style={{ fontSize: 12, color: C.ink2 }}>{r.purchase_date || "—"}</div>}
              <div style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(r.total, cur, lang)}</div>
            </div>
          ))}
        </div>)}
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#1C1B19", color: "#fff", borderRadius: 12, padding: "14px 18px", marginTop: 14 }}><Coins size={20} /><div style={{ fontWeight: 800, fontSize: 13 }}>{tr(L("Grand total", "Total général"))} · {recs.length}</div><div style={{ marginLeft: "auto", fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money(grand, cur, lang)}</div></div>
      </div>}

      {/* DASHBOARD */}
      {rview === "dashboard" && recs.length > 0 && <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "260px 1fr", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: C.faint }}>{tr(L("Grand total", "Total général"))}</div>
            <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money(grand, cur, lang)}</div>
            <div style={{ fontSize: 11.5, color: C.ink2 }}>{recs.length} {tr(L("receipts", "reçus"))}</div>
            <div style={{ height: 1, background: C.line, margin: "12px 0" }} />
            {cats.map((c) => <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "5px 0" }}>{chip(c)}<div style={{ flex: 1, height: 7, borderRadius: 6, background: RCAT_COLOR[c] || "#8A8378", opacity: .85, maxWidth: `${grand ? (byCat[c] / grand) * 100 : 0}%`, minWidth: 6 }} /><span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(byCat[c], cur, lang)}</span></div>)}
          </div>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, fontSize: 12, color: C.ink2 }}><b style={{ color: C.ink }}>{tr(L("Tax total", "Total des taxes"))}</b><div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{money(taxTotal, cur, lang)}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, alignContent: "start" }}>
          {recs.map((r) => (
            <div key={r.id} onClick={() => setEdit(r)} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 13, overflow: "hidden", cursor: "pointer" }}>
              <div style={{ height: 96, background: "#efeae0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>{urls[r.id] && !isPdfPath(r.image_path) ? <img src={urls[r.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Receipt size={24} style={{ color: "#c9c1b2" }} />}<span style={{ position: "absolute", top: 8, left: 8 }}>{chip(r.category)}</span></div>
              <div style={{ padding: "10px 11px" }}><div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.merchant || tr(L("(unread)", "(non lu)"))}</div><div style={{ fontSize: 11, color: C.faint }}>{r.purchase_date || "—"}</div><div style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{money(r.total, cur, lang)}</div></div>
            </div>
          ))}
        </div>
      </div>}

      {/* SCAN & REVIEW */}
      {rview === "scan" && recs.length > 0 && <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "220px 1fr", gap: 14 }}>
        <div>
          {recs.map((r) => (
            <div key={r.id} onClick={() => setScanSel(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 9, borderRadius: 10, cursor: "pointer", border: `1px solid ${scanSel === r.id ? "#dfe1f4" : "transparent"}`, background: scanSel === r.id ? C.accentSoft : "transparent" }}>
              <div style={{ width: 34, height: 34, borderRadius: 7, overflow: "hidden", background: "#f3efe7", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{urls[r.id] && !isPdfPath(r.image_path) ? <img src={urls[r.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Receipt size={14} style={{ color: C.faint }} />}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.merchant || tr(L("(unread)", "(non lu)"))}</div><div style={{ fontSize: 10.5, color: C.faint }}>{money(r.total, cur, lang)}</div></div>
              <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 20, padding: "1px 7px", background: r.status === "review" ? "#FBF1E0" : "#EAF6F0", color: r.status === "review" ? "#B4801F" : "#1F7A4D" }}>{r.status === "review" ? tr(L("review", "réviser")) : "✓"}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#1C1B19", color: "#fff", borderRadius: 12, padding: "11px 13px", marginTop: 12 }}><div style={{ fontWeight: 800, fontSize: 12 }}>{tr(L("Grand total", "Total général"))}</div><div style={{ marginLeft: "auto", fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money(grand, cur, lang)}</div></div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          {scanR ? <ReceiptEditForm r={scanR} url={urls[scanR.id]} tr={tr} lang={lang} onSave={(p: any) => save(scanR, p)} onDelete={() => del(scanR)} onOpen={() => openOriginal(scanR)} /> : <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("Select a receipt.", "Sélectionnez un reçu."))}</div>}
        </div>
      </div>}

      {edit && modalShell(<>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Receipt size={17} style={{ color: C.accent }} /> {tr(L("Receipt", "Reçu"))}</div>
          <span onClick={() => setEdit(null)} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
        </div>
        <div style={{ padding: 16, overflow: "auto" }}><ReceiptEditForm r={edit} url={urls[edit.id]} tr={tr} lang={lang} onSave={async (p: any) => { await save(edit, p); setEdit(null); }} onDelete={() => del(edit)} onOpen={() => openOriginal(edit)} /></div>
      </>, () => setEdit(null), 560)}

      {emailOpen && modalShell(<>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Send size={17} style={{ color: C.accent }} /> {tr(L("Email expense report", "Envoyer la note de frais"))}</div>
          <span onClick={() => setEmailOpen(false)} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F7F4EE", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}><Coins size={16} style={{ color: C.accent }} /><div style={{ fontSize: 12.5 }}>{recs.length} {tr(L("receipts", "reçus"))} · <b>{money(grand, cur, lang)}</b> · {tr(L("PDF attached", "PDF en pièce jointe"))}</div></div>
          <div style={railLbl}>{tr(L("To (emails)", "À (courriels)"))}</div>
          <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder={tr(L("accountant@firm.ca, …", "comptable@…"))} style={{ ...inp, marginTop: 6 }} autoFocus />
          <div style={{ ...railLbl, marginTop: 12 }}>{tr(L("Message (optional)", "Message (optionnel)"))}</div>
          <textarea value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)} style={{ ...inp, minHeight: 64, marginTop: 6 }} />
          <button onClick={sendReport} disabled={sending} style={{ width: "100%", marginTop: 14, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: sending ? .6 : 1 }}>{sending ? tr(L("Sending…", "Envoi…")) : tr(L("Send report", "Envoyer"))}</button>
        </div>
      </>, () => setEmailOpen(false), 420)}
    </div>
  );
}

// Gate shown when a form requires 2FA and the session isn't AAL2. Enrolls (if needed) then elevates.
function Require2FAGate({ formName, tr, onPassed, onCancel }: any) {
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [factorId, setFactorId] = useState(""); const [qr, setQr] = useState(""); const [secret, setSecret] = useState("");
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { (async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const on = (data?.totp ?? []).find((f: any) => f.status === "verified");
      if (on) { setFactorId(on.id); setMode("verify"); return; }
      for (const f of (data?.totp ?? [])) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Quorly", friendlyName: "Quorly" } as any);
      if (error) { setErr(error.message); return; }
      setFactorId(e!.id); setQr(e!.totp.qr_code); setSecret(e!.totp.secret); setMode("enroll");
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  })(); }, []);
  const verify = async () => {
    setBusy(true); setErr("");
    try { const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() }); if (error) { setErr(error.message); setBusy(false); return; } onPassed(); }
    catch (e: any) { setErr(String(e?.message ?? e)); setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 400, width: "100%", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.12)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}><span style={{ width: 34, height: 34, borderRadius: 9, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><ShieldCheck size={18} /></span><div style={{ fontWeight: 800, fontSize: 16 }}>{tr(L("Two-factor required", "Vérification en deux étapes requise"))}</div></div>
      <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>{tr(L(`“${formName}” requires two-factor authentication.`, `« ${formName} » exige la vérification en deux étapes.`))}</div>
      {mode === "loading" && <div style={{ color: C.faint, fontSize: 12.5, marginTop: 14 }}>…</div>}
      {mode === "enroll" && <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: C.ink2, marginBottom: 8 }}>{tr(L("Scan this in your authenticator app, then enter the code:", "Scannez ceci dans votre app, puis entrez le code :"))}</div>
        {qr && <img src={qr} alt="QR" style={{ width: 160, height: 160, display: "block", margin: "0 auto", border: `1px solid ${C.line}`, borderRadius: 12 }} />}
        <div style={{ fontSize: 10.5, color: C.faint, textAlign: "center", marginTop: 6 }}>{tr(L("Key: ", "Clé : "))}<span style={{ fontFamily: "ui-monospace,Menlo,monospace" }}>{secret}</span></div>
      </div>}
      {(mode === "verify" || mode === "enroll") && <>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()} placeholder="123456" inputMode="numeric" style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 18, letterSpacing: 6, textAlign: "center", boxSizing: "border-box", fontWeight: 800, marginTop: 14 }} autoFocus />
        {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        <button onClick={verify} disabled={busy || code.length !== 6} style={{ width: "100%", marginTop: 12, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy || code.length !== 6 ? .6 : 1 }}>{busy ? "…" : tr(L("Verify & continue", "Vérifier et continuer"))}</button>
      </>}
      {mode !== "enroll" && err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div onClick={onCancel} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: C.ink2, cursor: "pointer", marginTop: 12 }}>{tr(L("Back", "Retour"))}</div>
    </div>
  );
}

// Sub-forms grouped by type (e.g. Leaders, Financial, Board). Each sub-form is a full form.
function SubformsPanel({ form, tr, lang, onOpen }: any) {
  const [subs, setSubs] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [addingVote, setAddingVote] = useState(false);
  const [voteName, setVoteName] = useState("");
  const [group, setGroup] = useState("");
  const [myRole, setMyRole] = useState<string | null>(null);
  const reload = useCallback(() => { cf.subforms(form.id).then(setSubs).catch(() => setSubs([])); }, [form.id]);
  useEffect(() => { reload(); cf.myRole(form.id).then(setMyRole).catch(() => setMyRole(null)); }, [reload, form.id]);
  const createVote = async () => {
    const nm = voteName.trim(); if (!nm) return;
    try { const r = await cf.createVoteSubform(form.id, group, nm); setAddingVote(false); setVoteName(""); reload(); onOpen(r.form_id); }
    catch (e: any) { alert(e?.message || cfErr(null, tr)); }
  };
  const groups: Record<string, any[]> = {};
  subs.forEach((s) => { const g = s.group_name || tr(L("General", "Général")); (groups[g] = groups[g] || []).push(s); });
  const existing = Array.from(new Set(subs.map((s) => s.group_name).filter(Boolean)));
  // An office is staffed from this department's own roster — never by inviting an
  // outsider, who would land inside the department's work without having joined it.
  const [roster, setRoster] = useState<CfOfficePerson[]>([]);
  const [officeName, setOfficeName] = useState("");
  const [officeAdmin, setOfficeAdmin] = useState("");
  const [officeStaff, setOfficeStaff] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (adding) cf.officeRoster(form.id).then(setRoster).catch(() => setRoster([])); }, [adding, form.id]);
  const toggleStaff = (id: string) => setOfficeStaff((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const createOffice = async () => {
    const nm = officeName.trim();
    if (!nm || !officeAdmin || saving) return;
    setSaving(true);
    try {
      // The admin runs the office, so they are a member of it too — sending both keeps
      // that true even if the picker and the checkbox list disagree.
      const r = await cf.createOffice(form.id, group, nm, officeAdmin, officeStaff.filter((id) => id !== officeAdmin));
      setAdding(false); setOfficeName(""); setOfficeAdmin(""); setOfficeStaff([]);
      reload(); onOpen(r.form_id);
    } catch (e: any) { alert(e?.message || cfErr(null, tr)); }
    setSaving(false);
  };
  const abtn: any = { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 800, color: C.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: C.ink2, flex: 1, minWidth: 160 }}>{tr(L("The offices this department is divided into — e.g. Governance, Finance, Records. Each office has its own members, entries, folders, files and receipts.", "Les bureaux qui composent ce département — ex. Gouvernance, Finances, Registres. Chaque bureau a ses propres membres, entrées, dossiers, fichiers et reçus."))}</div>
        {form.is_admin && <span style={{ ...abtn, background: C.accent, color: "#fff", borderColor: C.accent }} onClick={() => setAdding((a) => !a)}><FileText size={14} /> {tr(L("New office", "Nouveau bureau"))}</span>}
        {(form.is_admin || myRole === "admin") && <span style={{ ...abtn, background: "#fff", color: C.accent, borderColor: C.accent }} onClick={() => setAddingVote((a) => !a)}><ThumbsUp size={14} /> {tr(L("New election", "Nouvelle élection"))}</span>}
      </div>
      {addingVote && <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
        <div style={railLbl}>{tr(L("Election name", "Nom de l'élection"))}</div>
        <input value={voteName} onChange={(e) => setVoteName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createVote()} placeholder={tr(L("e.g. Board election 2026", "ex. Élection du conseil 2026"))} style={inp} autoFocus />
        <div style={railLbl}>{tr(L("Group (optional)", "Groupe (optionnel)"))}</div>
        <input list="subform-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder={tr(L("e.g. Votes", "ex. Votes"))} style={inp} />
        <datalist id="subform-groups">{existing.map((g) => <option key={g as string} value={g as string} />)}</datalist>
        <div style={{ fontSize: 11.5, color: C.faint }}>{tr(L("Creates an election — members declare candidacy for positions, then vote For/Against with reasons. You close it to declare winners.", "Crée une élection — les membres se portent candidats à des postes, puis votent Pour/Contre avec raisons. Vous la clôturez pour déclarer les gagnants."))}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div onClick={() => setAddingVote(false)} style={{ flex: 1, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
          <div onClick={createVote} style={{ flex: 2, textAlign: "center", background: C.accent, color: "#fff", borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{tr(L("Create election", "Créer l'élection"))}</div>
        </div>
      </div>}
      {adding && <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
        <div style={railLbl}>{tr(L("Office name", "Nom du bureau"))}</div>
        <input value={officeName} onChange={(e) => setOfficeName(e.target.value)} placeholder={tr(L("e.g. Speaker's Office", "ex. Bureau du président")) } style={inp} autoFocus />

        <div style={railLbl}>{tr(L("Group (optional)", "Groupe (optionnel)"))}</div>
        <input list="subform-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder={tr(L("e.g. Financial", "ex. Finances"))} style={inp} />
        <datalist id="subform-groups">{existing.map((g) => <option key={g as string} value={g as string} />)}</datalist>

        <div style={railLbl}>{tr(L("Who runs it", "Qui le dirige"))}</div>
        <select value={officeAdmin} onChange={(e) => setOfficeAdmin(e.target.value)} style={inp}>
          <option value="">{tr(L("Choose an admin…", "Choisir un admin…"))}</option>
          {roster.map((p) => <option key={p.member_id} value={p.member_id}>{p.name}{p.title ? ` — ${p.title}` : ""}</option>)}
        </select>

        <div style={railLbl}>{tr(L("Members", "Membres"))} {officeStaff.length ? `· ${officeStaff.length}` : ""}</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, maxHeight: 190, overflowY: "auto" }}>
          {roster.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: C.faint }}>{tr(L("No members in this department yet.", "Aucun membre dans ce département."))}</div>}
          {roster.map((p) => {
            const isAdmin = p.member_id === officeAdmin;
            return (
              <label key={p.member_id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderBottom: `1px solid ${C.line}`, cursor: isAdmin ? "default" : "pointer", opacity: isAdmin ? .65 : 1 }}>
                <input type="checkbox" checked={isAdmin || officeStaff.includes(p.member_id)} disabled={isAdmin} onChange={() => toggleStaff(p.member_id)} />
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color || C.faint, flex: "0 0 auto" }} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                {isAdmin && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent }}>{tr(L("admin", "admin"))}</span>}
              </label>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint }}>{tr(L("Only members of this department can be added — an office is part of it, not a separate group.", "Seuls les membres de ce département peuvent être ajoutés — un bureau en fait partie, ce n'est pas un groupe séparé."))}</div>

        <div style={{ display: "flex", gap: 8 }}>
          <div onClick={() => setAdding(false)} style={{ flex: 1, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
          <div onClick={createOffice} style={{ flex: 2, textAlign: "center", background: officeName.trim() && officeAdmin ? C.accent : C.line, color: "#fff", borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, cursor: officeName.trim() && officeAdmin ? "pointer" : "default" }}>{saving ? tr(L("Creating…", "Création…")) : tr(L("Create office", "Créer le bureau"))}</div>
        </div>
      </div>}
      {subs.length === 0 && !adding && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("No offices yet.", "Aucun bureau."))}</div>}
      {Object.keys(groups).sort().map((g) => (
        <div key={g}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.faint, margin: "0 2px 6px" }}>{g}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {groups[g].map((s) => (
              <div key={s.id} onClick={async () => { if (s.im_member) return onOpen(s.id); if (s.kind === "election") { try { const r = await cf.electionEnsureMember(s.id); if (r?.ok) return onOpen(s.id); } catch { /* fall through */ } } alert(tr(L("You're not a member of this office. Ask its admin to invite you.", "Vous n'êtes pas membre de ce bureau. Demandez à son admin de vous inviter."))); }} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px", cursor: "pointer", opacity: s.im_member || s.kind === "election" ? 1 : .6 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: s.im_member || s.kind === "election" ? C.accentSoft : "#F0EEE9", color: s.im_member || s.kind === "election" ? C.accent : C.faint, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{s.kind === "election" ? <ThumbsUp size={15} /> : s.im_member ? <FileText size={16} /> : <Lock size={15} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}{s.kind === "election" ? <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, background: C.accentSoft, borderRadius: 6, padding: "1px 6px", marginLeft: 6 }}>{tr(L("Returning Office", "Bureau du scrutin"))}</span> : ""}</div><div style={{ fontSize: 11.5, color: C.faint }}>{s.members} {tr(L("members", "membres"))}{s.is_admin ? " · " + tr(L("admin", "admin")) : s.kind === "election" ? " · " + tr(L("open to all members", "ouvert à tous les membres")) : s.im_member ? "" : " · " + tr(L("not a member", "non membre"))}</div></div>
                <ChevronRight size={16} style={{ color: C.faint }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Comments + approve/reject voting on a file or folder → reach a decision.
function DiscussionPanel({ type, id, tr, lang }: { type: "file" | "folder"; id: string; tr: (o: any) => string; lang: string }) {
  const at = useAutoT();
  const [comments, setComments] = useState<CfDocComment[]>([]);
  const [dec, setDec] = useState<CfDocDecision | null>(null);
  const [body, setBody] = useState(""); const [busy, setBusy] = useState(false);
  const reload = useCallback(() => { cf.docComments(type, id).then(setComments).catch(() => {}); cf.docDecision(type, id).then(setDec).catch(() => {}); }, [type, id]);
  useEffect(() => { reload(); }, [reload]);
  const vote = async (v: "approve" | "reject") => { try { await cf.docVote(type, id, v); reload(); } catch (e: any) { alert(e.message); } };
  const add = async () => { if (!body.trim()) return; setBusy(true); try { await cf.docCommentAdd(type, id, body.trim()); setBody(""); reload(); } catch (e: any) { alert(e.message); } setBusy(false); };
  const mv = dec?.my_vote;
  const voteBtn = (v: "approve" | "reject", Icon: any, onColor: string) => (
    <button onClick={() => vote(v)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9, padding: "8px 10px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: `1px solid ${mv === v ? onColor : C.line}`, background: mv === v ? onColor : "#fff", color: mv === v ? "#fff" : C.ink2 }}>
      <Icon size={14} /> {v === "approve" ? tr(L("Approve", "Approuver")) : tr(L("Reject", "Rejeter"))} {dec ? (v === "approve" ? dec.approve : dec.reject) : ""}
    </button>
  );
  return (
    <div>
      {dec && (dec.decided
        ? <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#EAF6F0", color: "#1F7A4D", borderRadius: 9, padding: "8px 11px", fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}><CheckCircle2 size={15} /> {tr(L("Decision reached — approved", "Décision atteinte — approuvé"))} ({dec.approve}/{dec.threshold})</div>
        : <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 8 }}>{dec.approve} {tr(L("approve", "approuvent"))} · {dec.reject} {tr(L("reject", "rejettent"))} · {tr(L("needs", "requis"))} {dec.threshold} {tr(L("to decide", "pour décider"))}</div>)}
      <div style={{ display: "flex", gap: 8 }}>{voteBtn("approve", ThumbsUp, "#1F9D6B")}{voteBtn("reject", ThumbsDown, "#C0392B")}</div>
      <div style={{ marginTop: 12 }}>
        {comments.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>{tr(L("No comments yet.", "Aucun commentaire."))}</div>}
        {comments.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.author_color ?? "#CCC", marginTop: 4, flex: "0 0 auto" }} />
            <div><div><b style={{ fontWeight: 800 }}>{c.author_name}</b> <span style={{ color: C.faint, fontSize: 10.5 }}>{fmtDate(c.created_at, lang)}</span></div><div style={{ color: C.ink, lineHeight: 1.45 }}>{at(c.body)}</div></div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={tr(L("Add a comment…", "Ajouter un commentaire…"))} style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 9, fontSize: 12.5 }} />
        <span onClick={busy ? undefined : add} style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: "0 13px", display: "flex", alignItems: "center", fontWeight: 800, cursor: "pointer", opacity: busy || !body.trim() ? .6 : 1 }}><Send size={14} /></span>
      </div>
    </div>
  );
}

// Lost-document replacement guide — recognizes the issuing authority for a doc type + locality.
// Privacy: only the type + place you type are sent to the assistant; never the file itself.
function LostDocModal({ file, tr, lang, onClose }: any) {
  const det = detectDocType(file.name);
  const [docType, setDocType] = useState<string>(det.expiring ? tr(L(det.en!, det.fr!)) : "");
  const [locality, setLocality] = useState("");
  const [here, setHere] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [guide, setGuide] = useState<LostGuide | null>(null);
  const [err, setErr] = useState("");
  const useLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setErr(tr(L("Location isn't available on this device.", "La localisation n'est pas disponible."))); return; }
    setLocating(true); setErr("");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=${lang}`);
        const d = await r.json();
        const place = [d.city || d.locality, d.principalSubdivision, d.countryName].filter(Boolean).join(", ");
        setHere(place || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
      } catch { setErr(tr(L("Couldn't read your location.", "Localisation impossible."))); }
      setLocating(false);
    }, () => { setLocating(false); setErr(tr(L("Location permission denied.", "Permission de localisation refusée."))); }, { timeout: 10000, maximumAge: 60000 });
  };
  const go = async () => {
    if (!docType.trim() || !locality.trim()) { setErr(tr(L("Enter the document type and where it was issued.", "Entrez le type de document et le lieu d'émission."))); return; }
    setBusy(true); setErr(""); setGuide(null);
    try { setGuide(await cf.lostGuide(docType.trim(), locality.trim(), lang, here.trim())); } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  };
  const sec: any = { fontSize: 11, fontWeight: 800, letterSpacing: .3, textTransform: "uppercase", color: C.faint, margin: "14px 0 6px" };
  const steps = (arr?: string[]) => <ol style={{ margin: "0 0 0 2px", padding: 0, listStyle: "none" }}>{(arr ?? []).map((s, i) => <li key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.5, marginBottom: 5 }}><span style={{ color: C.accent, fontWeight: 800, flex: "0 0 auto" }}>{i + 1}.</span> {s}</li>)}</ol>;
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><LifeBuoy size={17} style={{ color: C.accent }} /> {tr(L("Lost document — replacement guide", "Document perdu — guide de remplacement"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16, overflow: "auto" }}>
      <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      <div style={railLbl}>{tr(L("Document type", "Type de document"))}</div>
      <input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder={tr(L("e.g. Passport, Driver's licence", "ex. Passeport, Permis de conduire"))} style={{ ...inp, marginTop: 6 }} />
      <div style={{ ...railLbl, marginTop: 12 }}>{tr(L("Where was it issued?", "Où a-t-il été émis ?"))}</div>
      <input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder={tr(L("e.g. Cameroon", "ex. Cameroun"))} style={{ ...inp, marginTop: 6 }} autoFocus />
      <div style={{ ...railLbl, marginTop: 12, display: "flex", alignItems: "center" }}>{tr(L("Where are you now? (optional)", "Où êtes-vous maintenant ? (optionnel)"))}
        <span onClick={locating ? undefined : useLocation} style={{ marginLeft: "auto", color: C.accent, cursor: "pointer", fontSize: 11, letterSpacing: 0, textTransform: "none", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {locating ? tr(L("Locating…", "Localisation…")) : tr(L("Use my location", "Ma position"))}</span>
      </div>
      <input value={here} onChange={(e) => setHere(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={tr(L("e.g. Montréal, Canada — if abroad, we add embassy steps", "ex. Montréal — si à l'étranger, on ajoute l'ambassade"))} style={{ ...inp, marginTop: 6 }} />
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 10.5, color: C.faint, marginTop: 8 }}><Lock size={12} style={{ flex: "0 0 auto", marginTop: 1 }} /> {tr(L("Only the type & place above are used — your file is never sent.", "Seuls le type et le lieu ci-dessus sont utilisés — votre fichier n'est jamais transmis."))}</div>
      {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <button onClick={go} disabled={busy} style={{ width: "100%", marginTop: 14, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? tr(L("Finding the right authority…", "Recherche de l'autorité…")) : guide ? tr(L("Refresh steps", "Actualiser")) : tr(L("Get replacement steps", "Obtenir les étapes"))}</button>

      {guide && (guide.raw ? <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 14, color: C.ink }}>{guide.raw}</div> : <div style={{ marginTop: 16 }}>
        {guide.authority && <div style={{ background: C.accentSoft, borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}><span style={{ color: C.accent, fontWeight: 800 }}>{tr(L("Issuing authority", "Autorité émettrice"))}: </span>{guide.authority}</div>}
        {guide.abroad && <div style={{ background: "#FBF1E0", border: "1px solid #F0E0C0", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, marginTop: 8, display: "flex", gap: 8 }}><Users size={15} style={{ color: "#B4801F", flex: "0 0 auto", marginTop: 1 }} /><div><span style={{ color: "#B4801F", fontWeight: 800 }}>{tr(L("You're abroad — contact the embassy", "À l'étranger — contactez l'ambassade"))}: </span>{guide.abroad}</div></div>}
        {guide.report?.length ? <><div style={sec}>{tr(L("Report it lost / stolen", "Signaler la perte / le vol"))}</div>{steps(guide.report)}</> : null}
        {guide.replace?.length ? <><div style={sec}>{tr(L("Get a replacement", "Obtenir un remplacement"))}</div>{steps(guide.replace)}</> : null}
        {guide.documents_needed?.length ? <><div style={sec}>{tr(L("Bring / prepare", "À apporter / préparer"))}</div><ul style={{ margin: "0 0 0 16px", padding: 0, fontSize: 12.5, lineHeight: 1.6 }}>{guide.documents_needed.map((d, i) => <li key={i}>{d}</li>)}</ul></> : null}
        {(guide.fees || guide.timeline) && <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {guide.fees && <div style={{ flex: 1, minWidth: 140, background: "#FBF1E0", borderRadius: 10, padding: "9px 11px", fontSize: 12 }}><div style={{ fontWeight: 800, color: "#B4801F", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .3 }}>{tr(L("Fees", "Frais"))}</div>{guide.fees}</div>}
          {guide.timeline && <div style={{ flex: 1, minWidth: 140, background: "#EAF6F0", borderRadius: 10, padding: "9px 11px", fontSize: 12 }}><div style={{ fontWeight: 800, color: "#1F7A4D", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .3 }}>{tr(L("Timeline", "Délai"))}</div>{guide.timeline}</div>}
        </div>}
        {guide.official_links?.length ? <><div style={sec}>{tr(L("Official links", "Liens officiels"))}</div>{guide.official_links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: C.accent, padding: "5px 0", textDecoration: "none" }}><ExternalLink size={13} /> {l.label}</a>)}</> : null}
        {guide.disclaimer && <div style={{ fontSize: 11, color: C.faint, marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 10, fontStyle: "italic" }}>{guide.disclaimer}</div>}
      </div>)}
    </div>
  </>, onClose, 520);
}

// E2E passphrase: first-time setup (with unrecoverable warning) or unlock. Returns a CryptoKey.
function UnlockModal({ tr, onKey, onCancel }: any) {
  const [info, setInfo] = useState<{ has_vault: boolean; salt: string | null; check: string | null } | null>(null);
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { cf.e2eInfo().then(setInfo).catch(() => setInfo({ has_vault: false, salt: null, check: null })); }, []);
  const go = async () => {
    if (!info) return; setBusy(true); setErr("");
    try {
      if (info.has_vault) {
        const key = await deriveKey(pass, info.salt!);
        if (!(await verifyCheck(key, info.check!))) { setErr(tr(L("Incorrect passphrase.", "Phrase secrète incorrecte."))); setBusy(false); return; }
        onKey(key);
      } else {
        if (pass.length < 8) { setErr(tr(L("Use at least 8 characters.", "Au moins 8 caractères."))); setBusy(false); return; }
        if (pass !== pass2) { setErr(tr(L("Passphrases don't match.", "Les phrases ne correspondent pas."))); setBusy(false); return; }
        const salt = newSalt(); const key = await deriveKey(pass, salt); const check = await makeCheck(key);
        const r = await cf.e2eSetup(salt, check);
        if (r.already) { const fresh = await cf.e2eInfo(); const k2 = await deriveKey(pass, fresh.salt!); if (!(await verifyCheck(k2, fresh.check!))) { setErr(tr(L("A passphrase already exists and didn't match.", "Une phrase existe déjà et ne correspond pas."))); setBusy(false); return; } onKey(k2); return; }
        onKey(key);
      }
    } catch (e: any) { setErr(String(e?.message ?? e)); setBusy(false); }
  };
  const inp2: any = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: 11, fontSize: 14, boxSizing: "border-box", marginTop: 8 };
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Lock size={17} style={{ color: C.accent }} /> {info?.has_vault ? tr(L("Unlock encrypted files", "Déverrouiller les fichiers chiffrés")) : tr(L("Create your encryption passphrase", "Créer votre phrase de chiffrement"))}</div>
      <span onClick={onCancel} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16 }}>
      {!info ? <div style={{ color: C.faint, fontSize: 12.5 }}>…</div> : <>
        <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}>{info.has_vault
          ? tr(L("Enter your passphrase to open end-to-end encrypted files on this device.", "Entrez votre phrase secrète pour ouvrir les fichiers chiffrés sur cet appareil."))
          : tr(L("This passphrase encrypts your files on your device. Quorly never sees it.", "Cette phrase chiffre vos fichiers sur votre appareil. Quorly ne la voit jamais."))}</div>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && info.has_vault && go()} placeholder={tr(L("Passphrase", "Phrase secrète"))} style={inp2} autoFocus />
        {!info.has_vault && <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder={tr(L("Confirm passphrase", "Confirmer la phrase"))} style={inp2} />}
        {!info.has_vault && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FBE9E7", border: "1px solid #F3C9C2", borderRadius: 10, padding: "9px 11px", marginTop: 12, fontSize: 11.5, color: "#8A2A1C" }}><AlertTriangle size={15} style={{ flex: "0 0 auto", marginTop: 1 }} /> {tr(L("If you forget this passphrase, your encrypted files can't be recovered — not even by Quorly.", "Si vous oubliez cette phrase, vos fichiers chiffrés sont irrécupérables — même par Quorly."))}</div>}
        {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        <button onClick={go} disabled={busy || !pass} style={{ width: "100%", marginTop: 14, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy || !pass ? .6 : 1 }}>{busy ? "…" : info.has_vault ? tr(L("Unlock", "Déverrouiller")) : tr(L("Create passphrase", "Créer la phrase"))}</button>
      </>}
    </div>
  </>, onCancel, 400);
}

// Two-factor authentication (TOTP) via Supabase MFA.
function TwoFactorModal({ tr, onClose }: any) {
  const [state, setState] = useState<"loading" | "none" | "enroll" | "on">("loading");
  const [factorId, setFactorId] = useState(""); const [qr, setQr] = useState(""); const [secret, setSecret] = useState("");
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const refresh = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const on = (data?.totp ?? []).find((f: any) => f.status === "verified");
    if (on) { setFactorId(on.id); setState("on"); } else setState("none");
  };
  useEffect(() => { refresh(); }, []);
  const startEnroll = async () => {
    setBusy(true); setErr("");
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.totp ?? [])) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Quorly", friendlyName: "Quorly" } as any);
      if (error) { setErr(error.message); setBusy(false); return; }
      setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setState("enroll");
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true); setErr("");
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error) { setErr(ch.error.message); setBusy(false); return; }
      const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() });
      if (v.error) { setErr(v.error.message); setBusy(false); return; }
      setState("on"); setCode("");
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm(tr(L("Turn off two-factor authentication?", "Désactiver la vérification en deux étapes ?")))) return;
    setBusy(true); try { await supabase.auth.mfa.unenroll({ factorId }); await refresh(); } catch (e: any) { setErr(String(e?.message ?? e)); } setBusy(false);
  };
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={17} style={{ color: C.accent }} /> {tr(L("Two-factor authentication", "Vérification en deux étapes"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16 }}>
      {state === "loading" && <div style={{ color: C.faint, fontSize: 12.5 }}>…</div>}
      {state === "none" && <>
        <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}>{tr(L("Add a second step at sign-in using an authenticator app (Google Authenticator, 1Password, Authy).", "Ajoutez une étape à la connexion avec une app d'authentification (Google Authenticator, 1Password, Authy)."))}</div>
        <button onClick={startEnroll} disabled={busy} style={{ width: "100%", marginTop: 14, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : tr(L("Turn on 2FA", "Activer la 2FA"))}</button>
        {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      </>}
      {state === "enroll" && <>
        <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 10 }}>{tr(L("1. Scan this in your authenticator app:", "1. Scannez ceci dans votre app :"))}</div>
        {qr && <div style={{ textAlign: "center" }}><img src={qr} alt="QR" style={{ width: 176, height: 176, background: "#fff", borderRadius: 12, border: `1px solid ${C.line}` }} /></div>}
        <div style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 6 }}>{tr(L("Or enter key: ", "Ou clé : "))}<span style={{ fontFamily: "ui-monospace,Menlo,monospace", color: C.ink2 }}>{secret}</span></div>
        <div style={{ fontSize: 12.5, color: C.ink2, margin: "12px 0 6px" }}>{tr(L("2. Enter the 6-digit code:", "2. Entrez le code à 6 chiffres :"))}</div>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()} placeholder="123456" inputMode="numeric" style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 18, letterSpacing: 6, textAlign: "center", boxSizing: "border-box", fontWeight: 800 }} autoFocus />
        {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        <button onClick={verify} disabled={busy || code.length !== 6} style={{ width: "100%", marginTop: 12, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy || code.length !== 6 ? .6 : 1 }}>{busy ? "…" : tr(L("Verify & turn on", "Vérifier et activer"))}</button>
      </>}
      {state === "on" && <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#EAF6F0", borderRadius: 10, padding: "12px 13px" }}><ShieldCheck size={20} style={{ color: "#1F7A4D" }} /><div><div style={{ fontWeight: 800, fontSize: 14, color: "#1F7A4D" }}>{tr(L("2FA is on", "2FA activée"))}</div><div style={{ fontSize: 11.5, color: C.ink2 }}>{tr(L("Your account asks for a code at sign-in.", "Un code est demandé à la connexion."))}</div></div></div>
        <div onClick={busy ? undefined : remove} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#B4531F", cursor: "pointer", marginTop: 14 }}>{tr(L("Turn off 2FA", "Désactiver la 2FA"))}</div>
        {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      </>}
    </div>
  </>, onClose, 400);
}

function SendModal({ file, tr, onClose }: any) {
  const [to, setTo] = useState(""); const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"link" | "attach">("link");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<number | null>(null);
  const send = async () => {
    const emails = to.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) { alert(tr(L("Enter at least one email.", "Entrez au moins un courriel."))); return; }
    setBusy(true);
    try { const r = await cf.sendFile(file.id, { to: emails, message: msg, mode }); setDone(r.sent); } catch (e: any) { alert(e.message); } setBusy(false);
  };
  const seg = (m: "link" | "attach", label: string, sub: string) => (
    <div onClick={() => setMode(m)} style={{ flex: 1, border: `1.5px solid ${mode === m ? C.accent : C.line}`, background: mode === m ? C.accentSoft : "#fff", borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: mode === m ? C.accent : C.ink }}>{label}</div>
      <div style={{ fontSize: 10.5, color: C.ink2, marginTop: 1 }}>{sub}</div>
    </div>
  );
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Send size={17} style={{ color: C.accent }} /> {tr(L("Send file", "Envoyer le fichier"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16, overflow: "auto" }}>
      <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      {done != null ? <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div style={{ fontSize: 30 }}>✅</div><div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{tr(L(`Sent to ${done} recipient(s)`, `Envoyé à ${done} destinataire(s)`))}</div>
        <div onClick={onClose} style={{ background: C.accent, color: "#fff", borderRadius: 10, padding: 11, textAlign: "center", fontWeight: 800, fontSize: 13.5, cursor: "pointer", marginTop: 14 }}>{tr(L("Done", "Terminé"))}</div>
      </div> : <>
        <div style={railLbl}>{tr(L("To (emails)", "À (courriels)"))}</div>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={tr(L("email, email…", "courriel, courriel…"))} style={{ ...inp, marginTop: 6 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>{seg("link", tr(L("Secure link", "Lien sécurisé")), tr(L("Revocable · recommended", "Révocable · recommandé")))}{seg("attach", tr(L("Attachment", "Pièce jointe")), tr(L("Up to 20 MB", "Jusqu'à 20 Mo")))}</div>
        <div style={{ ...railLbl, marginTop: 12 }}>{tr(L("Message (optional)", "Message (optionnel)"))}</div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} style={{ ...inp, minHeight: 64, marginTop: 6 }} />
        <button onClick={send} disabled={busy} style={{ width: "100%", marginTop: 14, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : tr(L("Send", "Envoyer"))}</button>
        {mode === "link" && <div style={{ fontSize: 11, color: C.faint, marginTop: 8, textAlign: "center" }}>{tr(L("They get a secure link you can revoke anytime.", "Ils reçoivent un lien sécurisé que vous pouvez révoquer à tout moment."))}</div>}
      </>}
    </div>
  </>, onClose, 400);
}

function ExpiryModal({ file, tr, lang, onClose, onSaved }: any) {
  const [date, setDate] = useState<string>(file.expires_at ?? "");
  const [days, setDays] = useState<number[]>(file.reminder_days?.length ? file.reminder_days : [30, 7, 1]);
  const [busy, setBusy] = useState(false);
  const opts = [30, 14, 7, 3, 1, 0];
  const toggle = (d: number) => setDays((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => b - a));
  const save = async () => { if (!date) { alert(tr(L("Pick an expiry date.", "Choisissez une date d'expiration."))); return; } setBusy(true); try { await cf.setExpiry(file.id, date, days); onSaved(); } catch (e: any) { alert(e.message); setBusy(false); } };
  const clear = async () => { setBusy(true); try { await cf.setExpiry(file.id, null, []); onSaved(); } catch (e: any) { alert(e.message); setBusy(false); } };
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><CalendarClock size={17} style={{ color: C.accent }} /> {tr(L("Expiry reminder", "Rappel d'expiration"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16, overflow: "auto" }}>
      <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      <div style={railLbl}>{tr(L("Expires on", "Expire le"))}</div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, marginTop: 6 }} />
      <div style={{ ...railLbl, marginTop: 14 }}>{tr(L("Remind me before (you choose)", "Me rappeler avant (à vous de choisir)"))}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
        {opts.map((d) => { const on = days.includes(d); return (
          <span key={d} onClick={() => toggle(d)} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accentSoft : "#fff", color: on ? C.accent : C.ink2 }}>{d === 0 ? tr(L("Day of", "Le jour même")) : tr(L(`${d} days`, `${d} jours`))}</span>
        ); })}
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>{tr(L("We'll email you on each chosen day before the date.", "Nous vous enverrons un courriel à chaque jour choisi avant la date."))}</div>
      <button onClick={save} disabled={busy} style={{ width: "100%", marginTop: 16, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : tr(L("Save reminder", "Enregistrer le rappel"))}</button>
      {file.expires_at && <div onClick={busy ? undefined : clear} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#B4531F", cursor: "pointer", marginTop: 12 }}>{tr(L("Remove expiry", "Retirer l'expiration"))}</div>}
    </div>
  </>, onClose, 400);
}

function SaveFormModal({ vaultId, tr, lang, memberOf, onClose, onSaved }: any) {
  const [forms, setForms] = useState<any[]>([]); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { cf.myForms().then(setForms).catch(() => setForms([])); }, []);
  const pick = async (f: any) => {
    setBusy(f.id);
    try {
      const [full, ents] = await Promise.all([cf.form(f.id), cf.entries(f.id)]);
      const mo: Record<string, any> = {}; (full.members ?? []).forEach((x: any) => { if (x.id) mo[x.id] = x; });
      const doc = await buildFormPdf(full, ents, mo, lang); const blob = doc.output("blob");
      await cf.fileSavePdf(vaultId, pdfFilename(full), blob); onSaved();
    } catch (e: any) { alert(e.message); setBusy(null); }
  };
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><FileText size={17} style={{ color: C.accent }} /> {tr(L("Save a form here", "Enregistrer un formulaire ici"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 12, overflow: "auto" }}>
      <div style={{ fontSize: 11.5, color: C.ink2, padding: "2px 4px 10px" }}>{tr(L("Save a PDF snapshot of one of your forms into your private vault.", "Enregistrez une copie PDF d'un de vos formulaires dans votre coffre privé."))}</div>
      {forms.length === 0 && <div style={{ color: C.faint, fontSize: 12.5, padding: 10 }}>{tr(L("You have no forms yet.", "Vous n'avez aucun formulaire."))}</div>}
      {forms.map((f) => (
        <div key={f.id} onClick={() => !busy && pick(f)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 10, cursor: "pointer", borderBottom: `1px solid ${C.line2}` }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><FileText size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div><div style={{ fontSize: 11, color: C.faint }}>{f.members} {tr(L("members", "membres"))}</div></div>
          {busy === f.id ? <span style={{ fontSize: 12, color: C.accent, fontWeight: 800 }}>…</span> : <Download size={15} style={{ color: C.faint }} />}
        </div>
      ))}
    </div>
  </>, onClose, 400);
}

// Right slide-in details + activity panel (Dropbox-style), reuses the action modals.
function DetailsDrawer({ file, form, tr, lang, activeMembers, onClose, onPreview, onShare, onVersions, onMove, onSend, onExpiry, onDownload, onRename, onDelete, onStar, canEdit }: any) {
  const [act, setAct] = useState<CfFileActivity[]>([]);
  const [share, setShare] = useState<CfShare>(null);
  const [vers, setVers] = useState<{ current: any; history: any[] } | null>(null);
  useEffect(() => {
    cf.fileActivity(file.id).then(setAct).catch(() => setAct([]));
    cf.shareGet(file.id).then(setShare).catch(() => {});
    cf.fileVersions(file.id).then(setVers).catch(() => {});
  }, [file.id]);
  const k = fileKind(file.name, file.mime);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://quorly.ca";
  const dsec: any = { fontSize: 10.5, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.faint, marginTop: 6 };
  const ghost: any = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 9, fontWeight: 800, fontSize: 12.5, cursor: "pointer" };
  const actWord = (a: string) => ({ uploaded: tr(L("uploaded this", "a téléversé")), new_version: tr(L("uploaded a new version", "a téléversé une version")), shared: tr(L("shared a link", "a partagé un lien")), renamed: tr(L("renamed this", "a renommé")), moved: tr(L("moved this", "a déplacé")), deleted: tr(L("deleted this", "a supprimé")), restored: tr(L("restored this", "a restauré")) } as any)[a] || a;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,.4)", zIndex: 180, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: "88vw", background: "#fff", height: "100%", overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 13, boxShadow: "-20px 0 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{tr(L("Details", "Détails"))}</div>
          <span onClick={(e) => { e.stopPropagation(); onStar(); }} style={{ cursor: "pointer", color: file.starred ? "#E0A83B" : "#D9CFBE", display: "flex" }}><Star size={18} fill={file.starred ? "#E0A83B" : "none"} /></span>
          <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
        </div>
        <div onClick={() => fileViewable(file) && onPreview()} style={{ background: "#20242e", borderRadius: 12, height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#aeb6c8", fontSize: 12, gap: 8, cursor: fileViewable(file) ? "pointer" : "default" }}>
          <span style={{ width: 34, height: 34, borderRadius: 8, background: k.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{k.tag}</span>{fileViewable(file) ? tr(L("Click to preview", "Cliquer pour aperçu")) : k.tag}
        </div>
        <div><div style={{ fontWeight: 800, fontSize: 15, wordBreak: "break-word" }}>{file.name}</div><div style={{ color: C.faint, fontSize: 12, marginTop: 2 }}>{kb(file.size ?? null)} · v{file.version ?? 1} · {fmtDate(file.created_at, lang)}</div></div>
        {file.encrypted
          ? <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.accentSoft, borderRadius: 10, padding: "9px 11px", fontSize: 11.5, color: C.accent, fontWeight: 700 }}><Lock size={15} /> {tr(L("End-to-end encrypted — only you can open it. Sharing is disabled.", "Chiffré de bout en bout — vous seul pouvez l'ouvrir. Partage désactivé."))}</div>
          : <div style={{ display: "flex", gap: 8 }}>
            <div onClick={onShare} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: C.accent, color: "#fff", borderRadius: 10, padding: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}><Share2 size={15} /> {tr(L("Share", "Partager"))}</div>
            <div onClick={onSend} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#fff", border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 10, padding: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}><Send size={15} /> {tr(L("Send", "Envoyer"))}</div>
          </div>}
        <div style={{ display: "flex", gap: 8 }}>
          {fileViewable(file) && <div style={ghost} onClick={onPreview}><Eye size={15} /> {tr(L("Open", "Ouvrir"))}</div>}
          <div style={ghost} onClick={onDownload}><Download size={15} /> {tr(L("Download", "Télécharger"))}</div>
        </div>
        {/* Expiry / reminder */}
        {(() => { const ex = expiryInfo(file, tr); return (
          <div onClick={onExpiry} style={{ display: "flex", alignItems: "center", gap: 9, background: ex ? ex.bg : "#F7F4EE", border: `1px solid ${ex ? "transparent" : C.line}`, borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
            <CalendarClock size={16} style={{ color: ex ? ex.fg : C.ink2, flex: "0 0 auto" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: ex ? ex.fg : C.ink }}>{ex ? ex.label : tr(L("No expiry set", "Aucune expiration"))}</div>
              <div style={{ fontSize: 10.5, color: ex ? ex.fg : C.faint }}>{file.expires_at ? (file.reminder_days?.length ? tr(L("Reminders: ", "Rappels : ")) + file.reminder_days.map((d: number) => d === 0 ? tr(L("day of", "le jour même")) : d + "d").join(", ") : tr(L("No reminders", "Sans rappel"))) : tr(L("Tap to set a renewal reminder", "Toucher pour définir un rappel"))}</div>
            </div>
            <ChevronRight size={15} style={{ color: C.faint }} />
          </div>
        ); })()}
        {canEdit && <div style={{ display: "flex", gap: 8 }}>
          <div style={ghost} onClick={onRename}><Pencil size={15} /> {tr(L("Rename", "Renommer"))}</div>
          <div style={ghost} onClick={onMove}><FolderInput size={15} /> {tr(L("Move", "Déplacer"))}</div>
          <div style={{ ...ghost, color: "#B4531F", flex: "0 0 auto", padding: "9px 12px" }} onClick={onDelete}><Trash2 size={15} /></div>
        </div>}

        {share && <><div style={dsec}>{tr(L("Shared via link", "Partagé par lien"))}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.accentSoft, borderRadius: 20, padding: "5px 10px", alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden" }}><Link2 size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{origin.replace(/^https?:\/\//, "")}/s/{share.token}</span></div></>}

        <div style={{ ...dsec, display: "flex", alignItems: "center", gap: 6 }}><Clock size={12} /> {tr(L("Version history", "Historique des versions"))}</div>
        {!vers ? <div style={{ fontSize: 12, color: C.faint }}>…</div> : <>
          <div style={{ fontSize: 12, display: "flex", gap: 8, padding: "3px 0" }}><span style={{ fontWeight: 800, color: C.accent }}>v{vers.current.version}</span><span style={{ color: C.ink2 }}>{tr(L("Current", "Actuelle"))} · {vers.current.uploader_name}</span><span onClick={onVersions} style={{ marginLeft: "auto", color: C.accent, fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{tr(L("All", "Tout"))}</span></div>
          {vers.history.slice(0, 2).map((v: any) => <div key={v.id} style={{ fontSize: 12, display: "flex", gap: 8, padding: "3px 0", color: C.ink2 }}><span style={{ fontWeight: 800, color: C.faint }}>v{v.version}</span><span>{v.uploader_name} · {fmtDate(v.created_at, lang)}</span></div>)}
        </>}

        <div style={{ ...dsec, display: "flex", alignItems: "center", gap: 6 }}><MessageSquare size={12} /> {tr(L("Discussion & decision", "Discussion & décision"))}</div>
        <DiscussionPanel type="file" id={file.id} tr={tr} lang={lang} />

        <div style={{ ...dsec, display: "flex", alignItems: "center", gap: 6 }}>{tr(L("Activity", "Activité"))}</div>
        {act.length === 0 ? <div style={{ fontSize: 12, color: C.faint }}>{tr(L("No activity yet.", "Aucune activité."))}</div> : act.slice(0, 12).map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 9, fontSize: 12, padding: "5px 0" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.actor_color ?? "#CCC", marginTop: 5, flex: "0 0 auto" }} />
            <div><div><b style={{ fontWeight: 800 }}>{a.actor_name}</b> {actWord(a.action)}</div><div style={{ color: C.faint, fontSize: 11 }}>{fmtDate(a.created_at, lang)}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Every file is previewable now — the modal renders the best viewer per type (and falls back gracefully).
function fileViewable(_f: CfFile) { return true; }
function previewKind(name: string, mime: string): "pdf" | "image" | "video" | "audio" | "text" | "office" | "other" {
  const n = (name || "").toLowerCase(), m = (mime || "").toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/.test(n)) return "image";
  if (m.startsWith("video/") || /\.(mp4|webm|ogv|mov|m4v)$/.test(n)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|wav|m4a|aac|oga|ogg|flac)$/.test(n)) return "audio";
  if (m.startsWith("text/") || /\.(txt|csv|tsv|md|markdown|json|xml|ya?ml|log|ini|conf|html?|css|js|ts|tsx|py|sql)$/.test(n)) return "text";
  if (/\.(docx?|xlsx?|pptx?|odt|ods|odp)$/.test(n) || m.includes("word") || m.includes("sheet") || m.includes("presentation") || m.includes("officedocument") || m.includes("ms-excel") || m.includes("ms-powerpoint")) return "office";
  return "other";
}

function FileMenuItem({ icon, label, onClick, danger }: any) {
  const [h, setH] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: danger ? "#B4531F" : (h ? C.accent : C.ink), background: h ? (danger ? "#FCEEE6" : C.accentSoft) : "transparent" }}>{icon} {label}</div>;
}

function modalShell(children: any, onClose: () => void, maxW = 460) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: maxW, width: "100%", background: C.paper, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.5)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function PreviewModal({ file, overrideUrl, tr, onClose, onDownload }: any) {
  const mob = useMobile();
  const kind = previewKind(file.name, file.mime || "");
  const encrypted = !!file.encrypted;
  const n = (file.name || "").toLowerCase(), m = (file.mime || "").toLowerCase();
  const isWord = /\.docx?$/.test(n) || m.includes("word") || m.includes("wordprocessing");
  const isExcel = /\.xlsx?$/.test(n) || m.includes("sheet") || m.includes("ms-excel");
  const clientOffice = kind === "office" && (isWord || isExcel);
  const [url, setUrl] = useState<string | null>(overrideUrl ?? null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [officeReady, setOfficeReady] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const bytes = async (): Promise<ArrayBuffer> => {
    if (overrideUrl) { const r = await fetch(overrideUrl); return await r.arrayBuffer(); }  // encrypted → already-decrypted blob URL
    return await (await cf.fileBlob(file.path)).arrayBuffer();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (clientOffice) {
          const buf = await bytes(); if (cancelled) return;
          if (isWord) {
            const { renderAsync } = await import("docx-preview");
            if (boxRef.current) { boxRef.current.innerHTML = ""; await renderAsync(buf, boxRef.current, undefined, { inWrapper: true, ignoreWidth: true, ignoreHeight: true, breakPages: true }); }
          } else {
            const XLSX = await import("xlsx");
            const wb = XLSX.read(buf, { type: "array" });
            if (boxRef.current) boxRef.current.innerHTML = wb.SheetNames.map((s: string) => `<div style="font:800 13px -apple-system,sans-serif;color:#2F3AA3;margin:14px 0 6px">${s}</div>` + XLSX.utils.sheet_to_html(wb.Sheets[s])).join("");
          }
          if (!cancelled) setOfficeReady(true);
          return;
        }
        const u = overrideUrl ?? await cf.fileUrl(file.path);
        if (cancelled) return; setUrl(u);
        if (kind === "text") { const r = await fetch(u); const t = await r.text(); if (!cancelled) setText(t.slice(0, 300000)); }
      } catch { if (!cancelled) setErr(true); }
    })();
    return () => { cancelled = true; };
  }, [file.path, overrideUrl, kind]);

  const office = url ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : "";
  const vh = mob ? "82vh" : "74vh";
  const frame: any = { width: "100%", height: vh, border: 0, borderRadius: 8, background: "#fff" };
  const fallback = (msg: string) => (
    <div style={{ padding: "50px 24px", textAlign: "center", color: "#cdd3e0" }}>
      <FileText size={40} style={{ margin: "0 auto 12px", color: "#8b93a7" }} />
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{msg}</div>
      <span onClick={onDownload} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: C.accent, color: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}><Download size={15} /> {tr(L("Download to open", "Télécharger pour ouvrir"))}</span>
    </div>
  );
  const paper: any = { background: "#fff", color: "#111", padding: 18, borderRadius: 8, minHeight: 240, maxHeight: "74vh", overflow: "auto" };

  let body: any;
  if (clientOffice) body = err ? fallback(tr(L("Couldn't render this file.", "Impossible d'afficher ce fichier.")))
    : <div style={{ position: "relative" }}>
        <style>{`.docx-wrapper{background:transparent!important;padding:0!important;gap:10px!important} .docx-wrapper>section.docx{width:100%!important;min-width:0!important;min-height:auto!important;padding:20px!important;margin:0!important;box-shadow:none!important;box-sizing:border-box!important} .docx-wrapper table{max-width:100%!important} .docx img{max-width:100%!important;height:auto!important}`}</style>
        {!officeReady && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#aeb6c8", fontSize: 13 }}>{tr(L("Rendering…", "Rendu…"))}</div>}
        <div ref={boxRef} style={{ ...paper, overflowX: "auto" }} />
      </div>;
  else if (!url && !err) body = <div style={{ padding: 60, textAlign: "center", color: "#aeb6c8", fontSize: 13 }}>{tr(L("Loading…", "Chargement…"))}</div>;
  else if (err) body = fallback(tr(L("Couldn't load this file.", "Impossible de charger ce fichier.")));
  else if (kind === "image") body = <img src={url!} alt={file.name} style={{ maxWidth: "100%", display: "block", margin: "0 auto", borderRadius: 8 }} />;
  else if (kind === "pdf") body = <iframe title={file.name} src={url!} style={frame} />;
  else if (kind === "video") body = <video src={url!} controls style={{ width: "100%", maxHeight: "74vh", borderRadius: 8, background: "#000" }} />;
  else if (kind === "audio") body = <div style={{ padding: 30 }}><audio src={url!} controls style={{ width: "100%" }} /></div>;
  else if (kind === "text") body = <pre style={{ ...paper, margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text ?? "…"}</pre>;
  else if (kind === "office") body = encrypted ? fallback(tr(L("Encrypted PowerPoint can't be previewed in-app — download to open.", "PowerPoint chiffré : téléchargez pour ouvrir."))) : <iframe title={file.name} src={office} style={frame} />;
  else body = fallback(tr(L("No in-app preview for this file type.", "Pas d'aperçu pour ce type de fichier.")));

  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}`, gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      <span onClick={onDownload} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}><Download size={15} /> {tr(L("Download", "Télécharger"))}</span>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: mob ? 8 : 14, overflow: "auto", background: "#20242e" }}>{body}</div>
  </>, onClose, mob ? 3000 : 900);
}

function VersionsModal({ file, form, tr, lang, onClose, onChanged }: any) {
  const [data, setData] = useState<{ current: any; history: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const upRef = useRef<HTMLInputElement | null>(null);
  const reload = useCallback(() => { cf.fileVersions(file.id).then(setData).catch(() => setData(null)); }, [file.id]);
  useEffect(() => { reload(); }, [reload]);
  const upload = async (fl: FileList | null) => { if (!fl?.[0]) return; setBusy(true); try { await cf.fileNewVersion(form.id, file.id, fl[0]); reload(); onChanged(); } catch (e: any) { alert(e.message); } setBusy(false); };
  const restore = async (v: any) => { if (!confirm(tr(L(`Restore version ${v.version}? The current version is kept in history.`, `Restaurer la version ${v.version} ? La version actuelle est conservée dans l'historique.`)))) return; setBusy(true); try { await cf.fileRestoreVersion(v.id); reload(); onChanged(); } catch (e: any) { alert(e.message); } setBusy(false); };
  const row = (v: any, current: boolean) => (
    <div key={v.id ?? "cur"} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.line}`, fontSize: 12.5 }}>
      <span style={{ fontWeight: 800, color: C.accent, width: 30 }}>v{v.version}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{current ? tr(L("Current", "Actuelle")) : tr(L("Previous", "Précédente"))}{v.size != null ? " · " + kb(v.size) : ""}</div>
        <div style={{ color: C.ink2, display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>{v.uploader_color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.uploader_color, display: "inline-block" }} />}{v.uploader_name} · {fmtDate(v.created_at, lang)}</div>
      </div>
      {!current && <span onClick={() => !busy && restore(v)} style={{ color: C.accent, fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>{tr(L("Restore", "Restaurer"))}</span>}
    </div>
  );
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Clock size={17} style={{ color: C.accent }} /> {tr(L("Versions", "Versions"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16, overflow: "auto" }}>
      <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      {!data ? <div style={{ color: C.faint, fontSize: 12.5, padding: 8 }}>{tr(L("Loading…", "Chargement…"))}</div> : <>
        {row(data.current, true)}
        {data.history.map((v) => row(v, false))}
      </>}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, background: C.accent, color: "#fff", borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: busy ? .6 : 1 }}>
        <Upload size={15} /> {busy ? tr(L("Uploading…", "Téléversement…")) : tr(L("Upload new version", "Téléverser une nouvelle version"))}
        <input ref={upRef} type="file" hidden onChange={(e) => { upload(e.target.files); e.currentTarget.value = ""; }} />
      </label>
    </div>
  </>, onClose, 440);
}

function ShareModal({ file, tr, onClose }: any) {
  const [share, setShare] = useState<CfShare>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState(""); const [usePw, setUsePw] = useState(false);
  const [expDays, setExpDays] = useState<number | null>(null);
  const [allowDl, setAllowDl] = useState(true);
  useEffect(() => { cf.shareGet(file.id).then((s) => { setShare(s); if (s) { setAllowDl(s.allow_download); setUsePw(s.has_password); } }).finally(() => setLoading(false)); }, [file.id]);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://quorly.ca";
  const link = share ? `${origin}/s/${share.token}` : "";
  const create = async () => { setBusy(true); try { const r = await cf.shareCreate(file.id, { password: usePw ? pw : null, expiresDays: expDays, allowDownload: allowDl }); setShare(await cf.shareGet(file.id)); void r; } catch (e: any) { alert(e.message); } setBusy(false); };
  const revoke = async () => { if (!confirm(tr(L("Turn off this link? It will stop working immediately.", "Désactiver ce lien ? Il cessera de fonctionner immédiatement.")))) return; setBusy(true); try { await cf.shareRevoke(file.id); setShare(null); setPw(""); setUsePw(false); } catch (e: any) { alert(e.message); } setBusy(false); };
  const copy = () => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const Toggle = ({ on, onClick }: any) => <span onClick={onClick} style={{ width: 38, height: 22, borderRadius: 99, background: on ? C.accent : "#D9D3C8", position: "relative", cursor: "pointer", flex: "0 0 auto" }}><span style={{ position: "absolute", top: 2, [on ? "right" : "left"]: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" } as any} /></span>;
  const optRow = (label: any, control: any) => <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: `1px solid ${C.line}`, fontSize: 13 }}><span>{label}</span>{control}</div>;
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><Link2 size={17} style={{ color: C.accent }} /> {tr(L("Share link", "Lien de partage"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 16, overflow: "auto" }}>
      <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      {loading ? <div style={{ color: C.faint, fontSize: 12.5 }}>{tr(L("Loading…", "Chargement…"))}</div> : share ? <>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input value={link} readOnly style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, fontSize: 12, color: C.ink2, background: "#fff" }} />
          <span onClick={copy} style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: "10px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{copied ? tr(L("Copied", "Copié")) : tr(L("Copy", "Copier"))}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.ink2, display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <span>{share.has_password ? "🔒 " + tr(L("Password on", "Mot de passe activé")) : tr(L("No password", "Sans mot de passe"))}</span>
          <span>{share.expires_at ? tr(L("Expires ", "Expire ")) + fmtDate(share.expires_at, "en") : tr(L("No expiry", "Sans expiration"))}</span>
          <span>{share.allow_download ? tr(L("Download allowed", "Téléchargement permis") ) : tr(L("View only", "Lecture seule"))}</span>
          {share.views > 0 && <span>{share.views} {tr(L("views", "vues"))}</span>}
        </div>
        <div onClick={() => !busy && revoke()} style={{ color: "#B4531F", fontWeight: 800, fontSize: 12.5, cursor: "pointer", marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>{tr(L("Turn off this link", "Désactiver ce lien"))}</div>
      </> : <>
        {optRow(tr(L("Require password", "Exiger un mot de passe")), <Toggle on={usePw} onClick={() => setUsePw(!usePw)} />)}
        {usePw && <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder={tr(L("Password", "Mot de passe"))} style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: 9, fontSize: 13, boxSizing: "border-box", marginTop: 2 }} />}
        {optRow(tr(L("Expires", "Expire")), <select value={expDays ?? 0} onChange={(e) => setExpDays(Number(e.target.value) || null)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 12.5 }}>
          <option value={0}>{tr(L("Never", "Jamais"))}</option><option value={1}>1 {tr(L("day", "jour"))}</option><option value={7}>7 {tr(L("days", "jours"))}</option><option value={30}>30 {tr(L("days", "jours"))}</option></select>)}
        {optRow(tr(L("Allow download", "Autoriser le téléchargement")), <Toggle on={allowDl} onClick={() => setAllowDl(!allowDl)} />)}
        <button onClick={create} disabled={busy || (usePw && !pw)} style={{ width: "100%", marginTop: 14, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy || (usePw && !pw) ? .6 : 1 }}>{busy ? "…" : tr(L("Create link", "Créer le lien"))}</button>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8, textAlign: "center" }}>{tr(L("Anyone with the link can view this file, even without a Quorly account.", "Toute personne disposant du lien peut voir ce fichier, même sans compte Quorly."))}</div>
      </>}
    </div>
  </>, onClose, 400);
}

function MoveModal({ file, form, tr, onClose, onMoved }: any) {
  const [folders, setFolders] = useState<CfFolder[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { cf.folders(form.id, null).then(setFolders).catch(() => setFolders([])); }, [form.id]);
  const move = async (folderId: string | null) => { setBusy(true); try { await cf.fileMove(file.id, folderId); onMoved(); } catch (e: any) { alert(e.message); setBusy(false); } };
  return modalShell(<>
    <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, flex: 1, display: "flex", alignItems: "center", gap: 8 }}><FolderInput size={17} style={{ color: C.accent }} /> {tr(L("Move to", "Déplacer vers"))}</div>
      <span onClick={onClose} style={{ color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
    </div>
    <div style={{ padding: 12, overflow: "auto" }}>
      <div onClick={() => !busy && move(null)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13.5, opacity: file.folder_id == null ? .5 : 1 }}><Home size={16} style={{ color: C.accent }} /> {tr(L("Top level (no folder)", "Niveau supérieur (aucun dossier)"))}</div>
      {folders.map((d) => (
        <div key={d.id} onClick={() => !busy && d.id !== file.folder_id && move(d.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13.5, opacity: d.id === file.folder_id ? .5 : 1 }}>
          <Folder size={16} style={{ color: "#E0A83B" }} /> {d.name}
        </div>
      ))}
      {folders.length === 0 && <div style={{ color: C.faint, fontSize: 12.5, padding: 10 }}>{tr(L("No folders yet — create one first.", "Aucun dossier — créez-en un d'abord."))}</div>}
    </div>
  </>, onClose, 380);
}

function FormEdit({ form, tr, isSpace, onSaved, onDeleted }: any) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(form.name || "");
  const [d, setD] = useState(form.description || "");
  const [r2fa, setR2fa] = useState(!!form.require_2fa);
  const [rdl, setRdl] = useState(!!form.require_download_approval);
  const [feats, setFeats] = useState<Record<string, boolean>>(form.features || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setN(form.name || ""); setD(form.description || ""); setR2fa(!!form.require_2fa); setRdl(!!form.require_download_approval); setFeats(form.features || {}); }, [form.id, form.name, form.description, form.require_2fa, form.require_download_approval, form.features]);
  const toggleFeat = async (key: string) => {
    const next = { ...feats, [key]: !feats[key] };
    setFeats(next);
    try { await cf.setFeatures(form.id, next, form.approval_count || 1); onSaved(); }
    catch (e: any) { alert(e.message); setFeats(feats); }
  };
  const FEATURES: { key: string; icon: any; en: string; fr: string; sub: [string, string] }[] = [
    { key: "member_entries", icon: PlusSquare, en: "Members can add entries", fr: "Les membres peuvent ajouter des entrées", sub: ["Anyone in the form can create a new entry — not just you.", "Tout membre peut créer une entrée — pas seulement vous."] },
    { key: "voting", icon: ThumbsUp, en: "Voting on entries", fr: "Vote sur les entrées", sub: ["Members approve/reject entries to reach a decision.", "Les membres approuvent/rejettent les entrées."] },
    { key: "comments", icon: MessageSquare, en: "Comments", fr: "Commentaires", sub: ["Members can discuss each entry.", "Les membres peuvent discuter chaque entrée."] },
  ];
  const save = async () => {
    if (!n.trim()) return; setBusy(true);
    try { const r = await cf.updateForm(form.id, n.trim(), d); if (r?.ok) { setOpen(false); onSaved(); } else alert(cfErr(r?.error, tr)); }
    catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const del = async () => {
    if (busy) return;
    if (!confirm(tr(L(`Delete "${form.name}"? This permanently removes the form, its entries, files and members for everyone. This can't be undone.`, `Supprimer « ${form.name} » ? Cela supprime définitivement le formulaire, ses entrées, fichiers et membres pour tout le monde. Irréversible.`)))) return;
    setBusy(true);
    try { await cf.deleteForm(form.id); setOpen(false); onDeleted?.(); }
    catch (e: any) { alert(e.message); setBusy(false); }
  };
  return (
    <>
      <span onClick={() => setOpen(true)} style={{ fontSize: 12, fontWeight: 800, color: C.accent, background: C.accentSoft, borderRadius: 8, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}><Settings size={13} /> {tr(L("Settings", "Réglages"))}</span>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: "100%", background: C.paper, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{tr(L("Edit form", "Modifier le formulaire"))}</div>
              <span onClick={() => setOpen(false)} style={{ marginLeft: "auto", color: C.faint, fontWeight: 800, cursor: "pointer" }}>✕</span>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={railLbl}>{tr(L("Form title", "Titre du formulaire"))}</div>
                <input value={n} onChange={(e) => setN(e.target.value)} style={{ ...inp, marginTop: 6 }} />
              </div>
              <div>
                <div style={railLbl}>{tr(L("Description", "Description"))}</div>
                <textarea value={d} onChange={(e) => setD(e.target.value)} placeholder={tr(L("What this form is for…", "À quoi sert ce formulaire…"))} style={{ ...inp, minHeight: 80, marginTop: 6 }} />
              </div>
              {!isSpace && !feats.election && (
                <div>
                  <div style={{ ...railLbl, marginBottom: 8 }}>{tr(L("Features", "Fonctionnalités"))}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {FEATURES.map((ft) => {
                      const on = !!feats[ft.key]; const Icon = ft.icon;
                      return (
                        <div key={ft.key} style={{ display: "flex", alignItems: "center", gap: 10, background: "#F7F4EE", borderRadius: 10, padding: "11px 12px" }}>
                          <Icon size={17} style={{ color: on ? C.accent : C.faint, flex: "0 0 auto" }} />
                          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 800 }}>{tr(L(ft.en, ft.fr))}</div><div style={{ fontSize: 10.5, color: C.faint }}>{tr(L(ft.sub[0], ft.sub[1]))}</div></div>
                          <span onClick={() => toggleFeat(ft.key)} style={{ width: 38, height: 22, borderRadius: 99, background: on ? C.accent : "#D9D3C8", position: "relative", cursor: "pointer", flex: "0 0 auto" }}><span style={{ position: "absolute", top: 2, [on ? "right" : "left"]: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" } as any} /></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F7F4EE", borderRadius: 10, padding: "11px 12px" }}>
                <ShieldCheck size={17} style={{ color: r2fa ? C.green : C.faint, flex: "0 0 auto" }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 800 }}>{tr(L("Require two-factor (2FA)", "Exiger la 2FA"))}</div><div style={{ fontSize: 10.5, color: C.faint }}>{tr(L("Members must pass 2FA to open this form.", "Les membres doivent passer la 2FA pour ouvrir ce formulaire."))}</div></div>
                <span onClick={async () => { const next = !r2fa; setR2fa(next); try { await cf.setForm2fa(form.id, next); } catch (e: any) { const pm = planLimitMsg(e, tr(L("en", "fr")) as "en" | "fr"); if (pm) { if (confirm(pm)) window.open("/pricing", "_blank"); } else alert(e.message); setR2fa(!next); } }} style={{ width: 38, height: 22, borderRadius: 99, background: r2fa ? C.accent : "#D9D3C8", position: "relative", cursor: "pointer", flex: "0 0 auto" }}><span style={{ position: "absolute", top: 2, [r2fa ? "right" : "left"]: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" } as any} /></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F7F4EE", borderRadius: 10, padding: "11px 12px" }}>
                <Download size={17} style={{ color: rdl ? C.accent : C.faint, flex: "0 0 auto" }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 800 }}>{tr(L("Approve downloads", "Approuver les téléchargements"))}</div><div style={{ fontSize: 10.5, color: C.faint }}>{tr(L("Members' downloads need your approval; you're notified.", "Les téléchargements des membres nécessitent votre approbation."))}</div></div>
                <span onClick={async () => { const next = !rdl; setRdl(next); try { await cf.setDownloadApproval(form.id, next); } catch (e: any) { const pm = planLimitMsg(e, tr(L("en", "fr")) as "en" | "fr"); if (pm) { if (confirm(pm)) window.open("/pricing", "_blank"); } else alert(e.message); setRdl(!next); } }} style={{ width: 38, height: 22, borderRadius: 99, background: rdl ? C.accent : "#D9D3C8", position: "relative", cursor: "pointer", flex: "0 0 auto" }}><span style={{ position: "absolute", top: 2, [rdl ? "right" : "left"]: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" } as any} /></span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div onClick={() => setOpen(false)} style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11, textAlign: "center", fontWeight: 800, fontSize: 13.5, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
                <div onClick={save} style={{ flex: 2, background: C.accent, color: "#fff", borderRadius: 9, padding: 11, textAlign: "center", fontWeight: 800, fontSize: 13.5, cursor: "pointer", opacity: busy || !n.trim() ? .6 : 1 }}>{busy ? "…" : tr(L("Save", "Enregistrer"))}</div>
              </div>
              <div onClick={del} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#B4531F", cursor: "pointer", marginTop: 2, borderTop: `1px solid ${C.line}`, paddingTop: 12, opacity: busy ? .6 : 1 }}>🗑 {tr(L("Delete this form", "Supprimer ce formulaire"))}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MembersRail({ form, meta, tr, lang, sel, loadForm }: any) {
  // An office is a form whose parent is a department rather than the organisation.
  // Its people come from that department's roster — so it gets the staff picker, and
  // never the invite box, which would pull in someone from outside the department.
  const isOffice = !!(meta?.parent_id && meta.parent_id !== meta.org_id);
  // Suspension keeps the seat and takes the floor — so it is a toggle here, not a removal.
  const suspend = async (m: any) => {
    const on = !m.suspended;
    if (on && !confirm(tr(L(`Suspend ${m.name ?? m.contact}? They keep access and can still read, but cannot post while boards are set to exclude suspended members.`,
                            `Suspendre ${m.name ?? m.contact} ? La personne garde l'accès et peut lire, mais ne pourra pas publier là où les suspendus sont exclus.`)))) return;
    try { const r = await cf.setMemberSuspended(m.member_id, on); if (r?.ok === false) alert(cfErr(r.error, tr)); else sel && loadForm(sel); }
    catch (e: any) { alert(e.message); }
  };
  // Distinct dot per member — stored colours are only unique within one form, so
  // a rail can otherwise show the same hue twice.
  const mc = useMemo(() => memberColors((form?.members ?? []).map((m: any) => ({ key: String(m.id ?? m.contact), color: m.color }))), [form?.members]);
  const remove = async (m: any) => {
    if (!confirm(tr(L(`Remove ${m.name ?? m.contact} — they'll lose access.`, `Retirer ${m.name ?? m.contact} — l'accès sera révoqué.`)))) return;
    try { await cf.removeMember(m.id); sel && loadForm(sel); } catch (e: any) { alert(e.message); }
  };
  return (
    <>
      <div style={railLbl}>{tr(L("Members", "Membres"))} · {form?.members.length ?? 0}</div>
      {(form?.members ?? []).map((m: any) => (
        <div key={(m.id ?? m.contact) as string} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 4px", opacity: m.status === "invited" ? 0.55 : 1 }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, background: mc[String(m.id ?? m.contact)] ?? "#CCC", flex: "0 0 auto" }} />
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name ?? m.contact}</div><div style={{ fontSize: 10, color: C.faint }}>{m.status === "invited" ? tr(L("invited", "invité")) : (m.joined_at ? tr(L("joined", "rejoint")) + " " + fmtDate(m.joined_at, lang) : m.contact)}</div></div>
          {m.role === "admin" && <span style={{ fontSize: 8.5, fontWeight: 800, color: C.accent, background: C.accentSoft, padding: "2px 7px", borderRadius: 9 }}>ADMIN</span>}
          {m.suspended && <span style={{ fontSize: 8.5, fontWeight: 800, color: "#B4531F", background: "#FBEFE7", padding: "2px 7px", borderRadius: 9 }}>{tr(L("SUSPENDED", "SUSPENDU"))}</span>}
          {form?.is_admin && m.role !== "admin" && m.member_id && (
            <span onClick={() => suspend(m)} title={m.suspended ? tr(L("Lift the suspension", "Lever la suspension")) : tr(L("Suspend — they keep reading, but lose the floor", "Suspendre — la personne peut lire, mais perd la parole"))}
              style={{ fontSize: 9.5, fontWeight: 800, color: m.suspended ? C.accent : C.faint, cursor: "pointer", flex: "0 0 auto" }}>
              {m.suspended ? tr(L("unsuspend", "réintégrer")) : tr(L("suspend", "suspendre"))}
            </span>
          )}
          {m.status === "invited" && form?.is_admin && <ResendLink form={form.id} contact={m.contact} tr={tr} />}
          {form?.is_admin && m.role !== "admin" && m.id && <span onClick={() => remove(m)} title={tr(L("Remove", "Retirer"))} style={{ color: C.faint, cursor: "pointer", display: "flex", flex: "0 0 auto" }}><X size={15} /></span>}
        </div>
      ))}
      {form?.is_admin && (isOffice
        ? <AddFromParent form={form.id} parentName={meta?.parent_name} tr={tr} onDone={() => sel && loadForm(sel)} />
        : <Invite form={form.id} tr={tr} lang={lang} onDone={() => sel && loadForm(sel)} />)}
    </>
  );
}

// Staff an EXISTING office from its parent department. The counterpart of the picker
// in the create form, so an office made before that existed is filled the same way.
function AddFromParent({ form, parentName, tr, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<CfOfficePerson[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) cf.officeCandidates(form).then(setPeople).catch(() => setPeople([])); }, [open, form]);
  const add = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try { await cf.officeAdd(form, picked); setPicked([]); setOpen(false); onDone?.(); }
    catch (e: any) { alert(e?.message || cfErr(null, tr)); }
    setBusy(false);
  };
  if (!open) return (
    <div onClick={() => setOpen(true)} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer" }}>
      <Plus size={14} /> {tr(L("Add from", "Ajouter depuis"))} {parentName || tr(L("the department", "le département"))}
    </div>
  );
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
      <div style={railLbl}>{tr(L("Add from", "Ajouter depuis"))} {parentName || tr(L("the department", "le département"))}</div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: "#fff", maxHeight: 210, overflowY: "auto" }}>
        {people.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.faint }}>{tr(L("Everyone from the department is already here.", "Tout le département est déjà ici."))}</div>}
        {people.map((p) => (
          <label key={p.member_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
            <input type="checkbox" checked={picked.includes(p.member_id)} onChange={() => setPicked((s) => s.includes(p.member_id) ? s.filter((x) => x !== p.member_id) : [...s, p.member_id])} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color || C.faint, flex: "0 0 auto" }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
        <div onClick={() => { setOpen(false); setPicked([]); }} style={{ flex: 1, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 800, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
        <div onClick={add} style={{ flex: 2, textAlign: "center", background: picked.length ? C.accent : C.line, color: "#fff", borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 800, cursor: picked.length ? "pointer" : "default" }}>
          {busy ? tr(L("Adding…", "Ajout…")) : `${tr(L("Add", "Ajouter"))}${picked.length ? ` · ${picked.length}` : ""}`}
        </div>
      </div>
    </div>
  );
}

function JoinCode({ tr, router }: any) {
  const [open, setOpen] = useState(false); const [c, setC] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!c.trim()) return; setBusy(true);
    try { const r = await cf.resolveCode(c.trim()); if (r?.ok && r.token) router.push(`/join?token=${r.token}`); else alert(tr(L("Invalid or already-used code.", "Code invalide ou déjà utilisé."))); }
    catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  if (!open) return <div onClick={() => setOpen(true)} style={{ background: C.accentSoft, color: C.accent, borderRadius: 11, padding: 11, textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{tr(L("Join with a code", "Rejoindre avec un code"))}</div>;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input value={c} onChange={(e) => setC(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={tr(L("Enter code", "Entrez le code"))} style={{ ...inp, textAlign: "center", letterSpacing: 2, fontWeight: 800, textTransform: "uppercase" }} />
      <div onClick={go} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "0 14px", display: "flex", alignItems: "center", fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "→"}</div>
    </div>
  );
}

function ResendLink({ form, contact, tr }: any) {
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const go = async (channel: "email" | "sms") => {
    setPick(false); if (busy) return; setBusy(true);
    const r = await cf.sendInvites(form, contact, channel); setBusy(false);
    if (r?.ok) alert(tr(L("Invite resent.", "Invitation renvoyée.")));
    else alert(tr(L("Couldn't resend: ", "Échec du renvoi : ")) + cfErr(r?.failed?.[0]?.error || r?.error, tr));
  };
  if (busy) return <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: C.faint }}>…</span>;
  if (pick) return (
    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span onClick={() => go("email")} style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{tr(L("Email", "Courriel"))}</span>
      <span onClick={() => go("sms")} style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}>SMS</span>
      <span onClick={() => setPick(false)} style={{ fontSize: 11, color: C.faint, cursor: "pointer" }}>✕</span>
    </span>
  );
  return <span onClick={() => setPick(true)} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{tr(L("Resend", "Renvoyer"))}</span>;
}

function Invite({ form, tr, lang, onDone }: any) {
  const [v, setV] = useState(""); const [busy, setBusy] = useState(false);
  // Accept many contacts at once: split on newline, comma, or semicolon.
  const list = v.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
  const send = async () => {
    if (!list.length || busy) return; setBusy(true);
    try {
      if (list.length === 1) {
        const r = await cf.invite(form, list[0], lang);
        if (r && r.ok === false) {
          alert(cfErr(r.error, tr));
        } else {
          const d = r?.delivery;
          if (d && d.ok === false) alert(tr(L("Member added, but the invite couldn't be delivered: ", "Membre ajouté, mais l'invitation n'a pu être envoyée : ")) + (d.failed?.[0]?.error || d.error || "unknown"));
          setV(""); onDone();
        }
      } else {
        const r = await cf.inviteMany(form, list, lang);
        const parts: string[] = [];
        if (r.added) parts.push(tr(L(`${r.added} invited`, `${r.added} invité(s)`)));
        if (r.already) parts.push(tr(L(`${r.already} already on form`, `${r.already} déjà membre(s)`)));
        if (r.invalid) parts.push(tr(L(`${r.invalid} invalid`, `${r.invalid} invalide(s)`)));
        if (r.failed.length) parts.push(tr(L(`${r.failed.length} failed`, `${r.failed.length} échec(s)`)));
        if (r.delivery && r.delivery.ok === false) parts.push(tr(L("delivery issue", "problème d'envoi")));
        alert(parts.join(" · ") || tr(L("Nothing to send.", "Rien à envoyer.")));
        if (r.added) { setV(""); onDone(); }
      }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <div style={{ ...railLbl, margin: "0 2px 2px", display: "flex", justifyContent: "space-between" }}>
        <span>{tr(L("Invite members", "Inviter des membres"))}</span>
        {list.length > 1 && <span style={{ color: C.accent }}>{list.length}</span>}
      </div>
      <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder={tr(L("Emails or phones — one per line, or comma-separated", "Courriels ou téléphones — un par ligne, ou séparés par des virgules"))} style={{ ...inp, marginTop: 8, minHeight: 62, resize: "vertical" }} />
      <div onClick={send} style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 800, marginTop: 8, cursor: "pointer", opacity: busy || !list.length ? .6 : 1 }}>{busy ? tr(L("Sending…", "Envoi…")) : list.length > 1 ? tr(L(`Send ${list.length} invites`, `Envoyer ${list.length} invitations`)) : tr(L("Send invite", "Envoyer l'invitation"))}</div>
    </div>
  );
}

function NewEntry({ form, tr, lang, onDone }: any) {
  const canPost = form.is_admin || form.features?.member_entries;
  // Who holds the floor here. Admins set it; everyone else just sees the rule, and
  // the server enforces it in cf_add_entry regardless of what the screen shows.
  const [aud, setAud] = useState<string>(form.post_audience || "all");
  const [audBusy, setAudBusy] = useState(false);
  const setAudience = async (a: string) => {
    const prev = aud; setAud(a); setAudBusy(true);
    try { const r = await cf.setPostAudience(form.id, a as any); if (r?.ok === false) { setAud(prev); alert(cfErr(r.error, tr)); } }
    catch (e: any) { setAud(prev); alert(e.message); }
    setAudBusy(false);
  };
  const AUD: [string, string, string][] = [
    ["all", "Everyone", "Tout le monde"],
    ["active", "Everyone but suspended", "Sauf les suspendus"],
    ["suspended", "Only suspended", "Seulement les suspendus"],
  ];
  // A member the rule shuts out is told so, instead of failing at submit.
  const blocked = !form.is_admin && ((aud === "active" && form.im_suspended) || (aud === "suspended" && !form.im_suspended));
  // When the form defines no structured fields, give a single free-text "Note" area.
  const fields = (form.features?.fields && (form.fields?.length ?? 0) > 0) ? form.fields : [{ id: "__note", label: "Note", type: "longtext", label_i18n: { en: "Note", fr: "Note" } }];
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!Object.values(vals).some((v) => String(v ?? "").trim())) { alert(tr(L("Enter something first.", "Entrez d'abord du contenu."))); return; }
    setBusy(true);
    try {
      const r = await cf.addEntry(form.id, vals);
      if (r && r.ok === false) alert(cfErr(r.error, tr));
      else { setVals({}); setOpen(false); onDone(); }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  if (!canPost) return null;
  const audienceBar = form.is_admin ? (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 9 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{tr(L("Who may post", "Qui peut publier"))}</span>
      {AUD.map(([k, en, fr]) => (
        <span key={k} onClick={audBusy ? undefined : () => setAudience(k)} style={{
          fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: "4px 10px", cursor: "pointer",
          background: aud === k ? C.accentSoft : "transparent", color: aud === k ? C.accent : C.faint,
          border: aud === k ? "1px solid transparent" : `1px dashed ${C.line}`, opacity: audBusy ? .6 : 1,
        }}>{tr(L(en, fr))}</span>
      ))}
    </div>
  ) : null;
  if (blocked) return (
    <div style={{ border: `1px dashed ${C.line}`, borderRadius: 11, padding: 12, textAlign: "center", fontSize: 12.5, color: C.faint }}>
      {aud === "active"
        ? tr(L("You're suspended — you can read, but not post here.", "Vous êtes suspendu — vous pouvez lire, mais pas publier ici."))
        : tr(L("Only suspended members may post in this thread.", "Seuls les membres suspendus peuvent publier ici."))}
    </div>
  );
  if (!open) return <>{audienceBar}<div onClick={() => setOpen(true)} style={{ border: `1px dashed ${C.line}`, borderRadius: 11, padding: 12, textAlign: "center", fontWeight: 700, fontSize: 13, color: C.accent, cursor: "pointer" }}>{form.adopt_rule === "majority" ? tr(L("+ New motion", "+ Nouvelle motion")) : tr(L("+ New entry", "+ Nouvelle entrée"))}</div></>;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {audienceBar}
      {fields.map((f: any) => (
        <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{flabel(f, lang)}</span>
          {f.type === "longtext" ? <textarea value={vals[f.label] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.label]: e.target.value }))} style={{ ...inp, minHeight: 60 }} />
            : f.type === "select" ? <select value={vals[f.label] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.label]: e.target.value }))} style={inp}><option value="">—</option>{(f.options ?? []).map((o: string) => <option key={o} value={o}>{foption(f, o, lang)}</option>)}</select>
            : <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={vals[f.label] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.label]: e.target.value }))} style={inp} />}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <div onClick={submit} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: busy ? .6 : 1 }}>{form.adopt_rule === "majority" ? tr(L("Put the motion", "Déposer la motion")) : tr(L("Post entry", "Publier"))}</div>
        <div onClick={() => setOpen(false)} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
      </div>
    </div>
  );
}

function EntryCard({ e, form, lang, tr, mobile, memberOf, reload }: any) {
  const at = useAutoT();   // what the member wrote, in the reader's language
  const a = memberOf[e.author];
  const [cmt, setCmt] = useState(""); const [trx, setTrx] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const vote = async () => { try { await cf.vote(e.id, "approve"); reload(); } catch (er: any) { alert(er.message); } };
  const addC = async () => { if (!cmt.trim()) return; try { await cf.addComment(e.id, cmt.trim()); setCmt(""); reload(); } catch (er: any) { alert(er.message); } };
  const translate = async () => { setBusy(true); try { const txt = Object.values(e.values || {}).join(" · "); const r = await cf.ai("translate", txt, { target_lang: lang === "fr" ? "French" : "English" }); setTrx(r.text ?? ""); } catch (er: any) { alert(er.message); } setBusy(false); };
  const polish = async () => { if (!cmt.trim()) return; setBusy(true); try { const r = await cf.ai("polish", cmt, { tone: "professional" }); if (r.text) setCmt(r.text); } catch (er: any) { alert(er.message); } setBusy(false); };
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ height: 3, background: a?.color ?? "#CCC" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px 6px" }}>
        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, fontWeight: 700, color: C.faint, background: C.line2, padding: "2px 7px", borderRadius: 5 }}>No. {String(e.seq).padStart(3, "0")}</span>
        <span style={chip(a?.color)}>{initials(a?.name)}</span><span style={{ fontSize: 13, fontWeight: 700 }}>{a?.name ?? "—"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{fmt(e.created_at, lang)}</span>
      </div>
      <div style={{ padding: "4px 16px 12px", display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "10px 18px" }}>
        {(() => {
          const defined = (form.fields ?? []) as any[];
          const labels = defined.map((f) => f.label);
          const extras = Object.keys(e.values ?? {}).filter((k) => !labels.includes(k)).map((k) => ({ id: `x_${k}`, label: k, type: "longtext" }));
          const all = [...defined, ...extras];
          return all.map((f: any) => (
            <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: f.type === "longtext" ? "1 / -1" : "auto" }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{flabel(f, lang)}</span>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: f.type === "longtext" ? 500 : 600, whiteSpace: "pre-wrap" }}>{(() => { const v = e.values?.[f.label]; return v == null || v === "" ? "—" : f.type === "select" ? foption(f, String(v), lang) : at(String(v)); })()}</span>
            </div>
          ));
        })()}
      </div>
      {form.features?.translation && (
        <div style={{ padding: "0 16px 12px" }}>
          <span onClick={translate} style={{ fontSize: 11, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{busy ? "…" : tr(L("Translate", "Traduire"))} ▾</span>
          {trx && <div style={{ borderLeft: `3px solid ${C.accent}`, background: C.accentSoft, borderRadius: "0 8px 8px 0", padding: "9px 11px", fontSize: 12.5, marginTop: 8 }}>{trx}</div>}
        </div>
      )}
      {form.features?.voting && e.status && (() => {
        // A motion carries when it reaches the bar. Where the bar is a MAJORITY it is
        // computed from the live membership (cf_form.adopt_needed), so it rises as the
        // group grows instead of resting on a number someone typed once.
        const needed = form.adopt_needed ?? form.approval_count ?? 1;
        const motion = form.adopt_rule === "majority";
        return (
        <div style={{ borderTop: `1px solid ${C.line2}`, background: "#FCFBF8", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {e.status === "approved"
            ? <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#E7F3EC", color: "#1F7A4D" }}>{motion ? tr(L("Adopted", "Adoptée")) : tr(L("Approved", "Approuvé"))} · {e.approvals}/{needed}</span>
            : <><span onClick={vote} style={{ background: C.green, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✓ {motion ? tr(L("Vote to adopt", "Voter l'adoption")) : tr(L("Approve", "Approuver"))}{e.my_vote === "approve" ? " ✓" : ""}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.ink2, fontWeight: 700 }}>
                  {e.approvals} / {needed}
                  {motion && <span style={{ color: C.faint, fontWeight: 600 }}> · {tr(L("majority of members", "majorité des membres"))}</span>}
                </span></>}
        </div>
        );
      })()}
      {form.features?.comments && (
        <div style={{ borderTop: `1px solid ${C.line2}`, background: "#FCFBF8", padding: "11px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {e.comments.map((c: any) => { const ca = memberOf[c.author]; return (
            <div key={c.id} style={{ display: "flex", gap: 9 }}><span style={chip(ca?.color)}>{initials(ca?.name)}</span>
              <div><span style={{ fontSize: 11.5, fontWeight: 800, color: ca?.color }}>{ca?.name ?? "—"}</span><span style={{ fontSize: 9.5, color: C.faint, marginLeft: 7 }}>{fmt(c.created_at, lang)}</span><div style={{ fontSize: 12, color: C.ink2, marginTop: 2 }}>{at(c.body)}</div></div>
            </div>); })}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input value={cmt} onChange={(ev) => setCmt(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && addC()} placeholder={tr(L("Write a comment…", "Écrire un commentaire…"))} style={{ ...inp, flex: 1 }} />
            {form.features?.ai && <span onClick={polish} title="AI polish" style={{ fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer" }}>✦</span>}
            <span onClick={addC} style={{ color: C.accent, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{tr(L("Send", "Envoyer"))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const sItem = (on: boolean): any => ({ padding: "9px 10px", borderRadius: 8, fontSize: 13, color: on ? C.ink : C.ink2, fontWeight: on ? 700 : 400, display: "flex", alignItems: "center", gap: 8, background: on ? "#fff" : "transparent", cursor: "pointer" });
const railHead: any = { fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, padding: "10px 6px 2px" };
// The rail's TOP-LEVEL sections — Organization, Personal, Growth. Bigger and darker
// than the sub-heads nested under them (Departments), and ruled off from each other so
// the eye can tell where one part of the app ends and the next begins.
const railSection: any = { fontSize: 12.5, fontWeight: 900, letterSpacing: .3, textTransform: "uppercase", color: C.ink, padding: "13px 6px 7px", marginTop: 11, borderTop: `1px solid ${C.line}` };
// Stable grouping that keeps the server's ordering and floats the ungrouped first.
function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const out: [string, T[]][] = [];
  rows.forEach((r) => {
    const k = key(r);
    const hit = out.find(([g]) => g === k);
    if (hit) hit[1].push(r); else out.push([k, [r]]);
  });
  return out.sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])));
}
const railLbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, margin: "6px 2px 8px" };
const chip = (c?: string): any => ({ width: 20, height: 20, borderRadius: 6, background: c ?? "#999", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800, flex: "0 0 20px" });
const inp: any = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, background: "#fff", color: C.ink, outline: "none", width: "100%" };
