"use client";
// Quorly — the mark a department wears: a transparent ICON or an emoji.
//
// Two tabs, one value. Icons are lucide, the same library the app's own chrome is
// drawn with, so a department's mark and the interface come from one hand — and being
// stroke SVG with no fill, they take the colour of whatever surface they sit on. An
// emoji cannot: it is a coloured picture, not a mark. Both are offered because some
// groups want the warmth of an emoji and some want the discipline of an icon.
//
// Stored in ONE column: "lucide:<name>" for an icon, the character for an emoji, so
// nothing had to migrate when icons arrived.
//
// Curated, not exhaustive. The OS picker's 3,800 faces and foods would bury the
// governance marks a board actually reaches for; here those lead, and search matches
// English AND French so "argent", "réunion" and "camion" work as well as their
// English equivalents.
import { useMemo, useState } from "react";
import { ICON_GROUPS, ICONS, LUCIDE_PREFIX, isIconMark, iconName } from "./deptIcons";

const C = { ink: "#14131A", muted: "#8a8790", line: "#ECE9E2", accent: "#2F3AA3", soft: "#EEEBFA", cream: "#FBF8F2" };
const L = (en: string, fr: string) => ({ en, fr });

// Accents are stripped so "reunion" finds "réunion".
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const EMOJI_GROUPS: { nm: [string, string]; items: { e: string; k: string }[] }[] = [
  { nm: ["Governance & records", "Gouvernance & registres"], items: [{ e: "\ud83c\udfdb", k: "parliament assembly chamber parlement assembl\u00e9e chambre" }, { e: "\u2696\ufe0f", k: "balance justice law balance justice loi" }, { e: "\ud83d\uddf3\ufe0f", k: "ballot vote election urne vote \u00e9lection" }, { e: "\ud83e\uddee", k: "abacus count tally boulier compte scrutin" }, { e: "\ud83d\udcdc", k: "scroll charter bylaw parchemin charte r\u00e8glement" }, { e: "\ud83e\udeb6", k: "quill minutes secretary plume proc\u00e8s-verbal secr\u00e9taire" }, { e: "\u2712\ufe0f", k: "nib sign signature plume signature" }, { e: "\ud83d\udd8b\ufe0f", k: "fountain pen stylo plume" }, { e: "\ud83d\udccb", k: "clipboard agenda presse-papiers ordre du jour" }, { e: "\ud83d\uddc2\ufe0f", k: "dividers files intercalaires dossiers" }, { e: "\ud83d\uddc4\ufe0f", k: "filing cabinet archive classeur archives" }, { e: "\ud83d\uddc3\ufe0f", k: "card box registry bo\u00eete registre" }, { e: "\ud83d\udcc7", k: "card index roll fichier r\u00f4le" }, { e: "\ud83c\udff7\ufe0f", k: "label tag \u00e9tiquette" }, { e: "\ud83d\udd16", k: "bookmark signet" }, { e: "\ud83d\udccc", k: "pin punaise" }, { e: "\ud83d\udcce", k: "paperclip trombone" }, { e: "\ud83d\udd87\ufe0f", k: "clips trombones" }, { e: "\ud83d\udcd0", k: "rules standards r\u00e8gles normes" }, { e: "\ud83d\udccf", k: "measure mesure" }, { e: "\ud83d\udd0f", k: "sealed secure scell\u00e9 s\u00e9curis\u00e9" }, { e: "\ud83d\udddd\ufe0f", k: "old key custody vieille cl\u00e9 garde" }, { e: "\ud83d\udd11", k: "key access cl\u00e9 acc\u00e8s" }, { e: "\ud83d\udee1\ufe0f", k: "shield protection bouclier protection" }, { e: "\u269c\ufe0f", k: "fleur-de-lis quebec fleur de lys qu\u00e9bec" }, { e: "\ud83c\udf96\ufe0f", k: "office honour fonction honneur" }, { e: "\ud83d\udc51", k: "chair president pr\u00e9sidence couronne" }] },
  { nm: ["Money & treasury", "Argent & tr\u00e9sorerie"], items: [{ e: "\ud83e\uddfa", k: "basket collection fund panier qu\u00eate caisse" }, { e: "\ud83e\ude99", k: "coin dues pi\u00e8ce cotisation" }, { e: "\ud83d\udcb3", k: "card payment carte paiement" }, { e: "\ud83e\uddfe", k: "receipt invoice re\u00e7u facture" }, { e: "\ud83c\udfe6", k: "bank banque" }, { e: "\ud83d\udcb0", k: "money bag sac argent" }, { e: "\ud83d\udcb5", k: "cash comptant" }, { e: "\ud83d\udcca", k: "budget chart budget graphique" }, { e: "\ud83d\udcc8", k: "growth revenue croissance revenus" }, { e: "\ud83d\udcc9", k: "loss deficit perte d\u00e9ficit" }, { e: "\ud83d\udcb9", k: "finance market finance march\u00e9" }, { e: "\ud83e\udeba", k: "savings nest egg \u00e9pargne bas de laine" }, { e: "\ud83c\udffa", k: "treasury vessel tr\u00e9sor vase" }, { e: "\u26b1\ufe0f", k: "reserve urn r\u00e9serve urne" }, { e: "\ud83d\udd10", k: "secured funds fonds s\u00e9curis\u00e9s" }] },
  { nm: ["Meetings & time", "R\u00e9unions & temps"], items: [{ e: "\ud83d\udcc5", k: "calendar date calendrier date" }, { e: "\ud83d\uddd3\ufe0f", k: "schedule planner horaire agenda" }, { e: "\u23f0", k: "alarm reminder r\u00e9veil rappel" }, { e: "\u23f3", k: "deadline hourglass \u00e9ch\u00e9ance sablier" }, { e: "\ud83d\udd70\ufe0f", k: "clock time horloge temps" }, { e: "\ud83d\udd14", k: "bell notice cloche avis" }, { e: "\ud83d\udce3", k: "announce annonce" }, { e: "\ud83d\udce2", k: "loudspeaker call haut-parleur convocation" }, { e: "\ud83c\udf99\ufe0f", k: "floor speak mic parole micro" }, { e: "\ud83d\udcac", k: "discussion discussion" }, { e: "\ud83d\udde8\ufe0f", k: "comment commentaire" }, { e: "\ud83e\udd1d", k: "agreement motion entente motion" }, { e: "\u270b", k: "hand raise main lev\u00e9e" }, { e: "\u2705", k: "adopted carried adopt\u00e9" }, { e: "\u274c", k: "rejected defeated rejet\u00e9" }, { e: "\ud83d\udd01", k: "recurring r\u00e9current" }] },
  { nm: ["Communication", "Communication"], items: [{ e: "\u2709\ufe0f", k: "email letter courriel lettre" }, { e: "\ud83d\udce8", k: "incoming mail courrier re\u00e7u" }, { e: "\ud83d\udcec", k: "mailbox bo\u00eete lettres" }, { e: "\ud83d\udcde", k: "phone call appel t\u00e9l\u00e9phone" }, { e: "\u260e\ufe0f", k: "telephone t\u00e9l\u00e9phone" }, { e: "\ud83d\udcf1", k: "mobile mobile" }, { e: "\ud83d\udce1", k: "broadcast signal diffusion signal" }, { e: "\ud83d\udcfb", k: "radio radio" }, { e: "\ud83d\udcf0", k: "news bulletin nouvelles bulletin" }, { e: "\ud83d\udda5\ufe0f", k: "desk computer ordinateur" }, { e: "\ud83d\udcbb", k: "laptop portable" }, { e: "\ud83c\udf10", k: "web site site web" }, { e: "\ud83d\udce4", k: "outbox send envoi" }, { e: "\ud83d\udce5", k: "inbox receive r\u00e9ception" }] },
  { nm: ["Work & trades", "Travail & m\u00e9tiers"], items: [{ e: "\ud83d\udd27", k: "wrench repair cl\u00e9 r\u00e9paration" }, { e: "\ud83d\udd28", k: "hammer build marteau construction" }, { e: "\u2699\ufe0f", k: "gear operations engrenage op\u00e9rations" }, { e: "\ud83e\uddf0", k: "toolbox bo\u00eete \u00e0 outils" }, { e: "\ud83e\ude9b", k: "screwdriver tournevis" }, { e: "\ud83e\ude9a", k: "saw scie" }, { e: "\ud83e\uddf1", k: "bricks briques" }, { e: "\ud83c\udfd7\ufe0f", k: "construction site chantier" }, { e: "\ud83d\udea7", k: "works barrier travaux barri\u00e8re" }, { e: "\u26d1\ufe0f", k: "safety helmet casque s\u00e9curit\u00e9" }, { e: "\ud83e\uddba", k: "hi-vis vest dossard" }, { e: "\ud83e\uddef", k: "extinguisher extincteur" }, { e: "\ud83d\udd0c", k: "electrical \u00e9lectricit\u00e9" }, { e: "\ud83e\ude9c", k: "ladder \u00e9chelle" }, { e: "\ud83e\uddf9", k: "cleaning nettoyage" }, { e: "\ud83e\uddfd", k: "maintenance entretien" }] },
  { nm: ["Transport & road", "Transport & route"], items: [{ e: "\ud83d\ude9a", k: "truck delivery camion livraison" }, { e: "\ud83d\ude9b", k: "lorry freight semi-remorque fret" }, { e: "\ud83d\ude90", k: "van shuttle fourgonnette navette" }, { e: "\ud83d\ude97", k: "car voiture" }, { e: "\ud83d\ude95", k: "taxi cab taxi" }, { e: "\ud83d\udefb", k: "pickup camionnette" }, { e: "\ud83d\ude8c", k: "bus autobus" }, { e: "\ud83d\ude8f", k: "stop arr\u00eat" }, { e: "\ud83d\udee3\ufe0f", k: "highway route autoroute route" }, { e: "\ud83d\udede", k: "tyre wheel pneu roue" }, { e: "\u26fd", k: "fuel carburant" }, { e: "\ud83e\udded", k: "navigation navigation" }, { e: "\ud83d\uddfa\ufe0f", k: "map territory carte territoire" }, { e: "\ud83d\udea6", k: "traffic circulation" }, { e: "\ud83d\udea8", k: "incident alert incident alerte" }, { e: "\ud83d\udccd", k: "location emplacement" }, { e: "\ud83c\udd7f\ufe0f", k: "parking stationnement" }, { e: "\ud83d\udec2", k: "permit licence permis" }] },
  { nm: ["Learning & study", "Formation & \u00e9tude"], items: [{ e: "\ud83d\udcda", k: "library books biblioth\u00e8que livres" }, { e: "\ud83d\udcd6", k: "reading lecture" }, { e: "\ud83c\udf93", k: "training graduation formation dipl\u00f4me" }, { e: "\ud83c\udfeb", k: "school \u00e9cole" }, { e: "\ud83d\udd2c", k: "research recherche" }, { e: "\ud83d\udd2d", k: "outlook vision observation vision" }, { e: "\ud83e\uddea", k: "testing essais" }, { e: "\ud83d\udca1", k: "idea proposal id\u00e9e proposition" }, { e: "\ud83e\udde0", k: "strategy strat\u00e9gie" }, { e: "\ud83d\udcdd", k: "exam notes examen notes" }, { e: "\ud83c\udfc5", k: "achievement r\u00e9ussite" }] },
  { nm: ["Care & wellbeing", "Sant\u00e9 & entraide"], items: [{ e: "\ud83e\ude7a", k: "health check sant\u00e9 examen" }, { e: "\ud83c\udfe5", k: "clinic hospital clinique h\u00f4pital" }, { e: "\ud83d\udc8a", k: "medicine m\u00e9dicament" }, { e: "\ud83d\ude91", k: "ambulance emergency ambulance urgence" }, { e: "\u2764\ufe0f\u200d\ud83e\ude79", k: "mutual aid support entraide soutien" }, { e: "\ud83e\udef6", k: "care solidarity solidarit\u00e9" }, { e: "\ud83e\uddd1\u200d\u2695\ufe0f", k: "carer nurse soignant infirmier" }, { e: "\ud83c\udd98", k: "help sos secours" }] },
  { nm: ["Community & people", "Communaut\u00e9 & personnes"], items: [{ e: "\ud83d\udc65", k: "members group membres groupe" }, { e: "\ud83e\uddd1\u200d\ud83e\udd1d\u200d\ud83e\uddd1", k: "together ensemble" }, { e: "\ud83d\ude4c", k: "celebrate together c\u00e9l\u00e9brer" }, { e: "\u270a", k: "solidarity union solidarit\u00e9 syndicat" }, { e: "\ud83d\udde3\ufe0f", k: "voice speak voix parole" }, { e: "\ud83c\udfd8\ufe0f", k: "neighbourhood quartier" }, { e: "\ud83c\udfe2", k: "building office immeuble bureau" }, { e: "\ud83c\udfe0", k: "housing home logement maison" }, { e: "\ud83c\udf0d", k: "international international" }, { e: "\ud83d\udd4a\ufe0f", k: "peace paix" }, { e: "\ud83c\udf97\ufe0f", k: "cause ribbon cause ruban" }] },
  { nm: ["Food & hospitality", "Alimentation & accueil"], items: [{ e: "\ud83c\udf7d\ufe0f", k: "meals dining repas" }, { e: "\u2615", k: "coffee break caf\u00e9 pause" }, { e: "\ud83e\udd56", k: "bakery bread boulangerie pain" }, { e: "\ud83c\udf72", k: "kitchen soup cuisine soupe" }, { e: "\ud83e\uddd1\u200d\ud83c\udf73", k: "catering chef traiteur chef" }, { e: "\ud83d\uded2", k: "groceries \u00e9picerie" }, { e: "\ud83e\udd64", k: "refreshments rafra\u00eechissements" }, { e: "\ud83c\udf82", k: "anniversary anniversaire" }] },
  { nm: ["Culture & celebration", "Culture & f\u00eates"], items: [{ e: "\ud83c\udf89", k: "party celebration f\u00eate c\u00e9l\u00e9bration" }, { e: "\ud83c\udf8a", k: "confetti confettis" }, { e: "\ud83c\udfad", k: "theatre arts th\u00e9\u00e2tre arts" }, { e: "\ud83c\udfb5", k: "music musique" }, { e: "\ud83c\udfa8", k: "art art" }, { e: "\ud83c\udfac", k: "film video film vid\u00e9o" }, { e: "\ud83d\udcf8", k: "photos photos" }, { e: "\ud83c\udfc6", k: "trophy award troph\u00e9e prix" }, { e: "\ud83e\udd47", k: "first place premi\u00e8re place" }, { e: "\ud83c\udfaa", k: "festival festival" }, { e: "\ud83e\ude85", k: "fun amusement" }] },
  { nm: ["Sport & recreation", "Sport & loisirs"], items: [{ e: "\u26bd", k: "soccer soccer" }, { e: "\ud83c\udfc0", k: "basketball basketball" }, { e: "\ud83c\udfd2", k: "hockey hockey" }, { e: "\u26f8\ufe0f", k: "skating patinage" }, { e: "\ud83c\udfbf", k: "ski ski" }, { e: "\ud83d\udeb4", k: "cycling v\u00e9lo" }, { e: "\ud83c\udfc3", k: "running course" }, { e: "\ud83c\udfa3", k: "fishing p\u00eache" }, { e: "\ud83c\udfd5\ufe0f", k: "camping outdoors camping plein air" }, { e: "\u265f\ufe0f", k: "chess club \u00e9checs" }, { e: "\ud83c\udfb2", k: "games jeux" }, { e: "\ud83c\udfaf", k: "target goals objectifs cible" }] },
  { nm: ["Faith & tradition", "Foi & tradition"], items: [{ e: "\u26ea", k: "church \u00e9glise" }, { e: "\ud83d\udd4c", k: "mosque mosqu\u00e9e" }, { e: "\ud83d\udd4d", k: "synagogue synagogue" }, { e: "\ud83d\uded5", k: "temple temple" }, { e: "\ud83d\ude4f", k: "prayer pri\u00e8re" }, { e: "\u271d\ufe0f", k: "cross croix" }, { e: "\u262a\ufe0f", k: "crescent croissant" }, { e: "\ud83d\udd49\ufe0f", k: "om om" }, { e: "\ud83e\udeaf", k: "khanda khanda" }, { e: "\ud83d\udd6f\ufe0f", k: "remembrance candle bougie souvenir" }] },
  { nm: ["Nature & seasons", "Nature & saisons"], items: [{ e: "\ud83c\udf41", k: "maple canada autumn \u00e9rable canada automne" }, { e: "\ud83c\udf32", k: "forest for\u00eat" }, { e: "\ud83c\udf0a", k: "water river eau rivi\u00e8re" }, { e: "\u26f0\ufe0f", k: "mountain montagne" }, { e: "\u2744\ufe0f", k: "winter snow hiver neige" }, { e: "\ud83c\udf3b", k: "summer \u00e9t\u00e9" }, { e: "\ud83c\udf3e", k: "harvest agriculture r\u00e9colte agriculture" }, { e: "\ud83c\udf31", k: "growth new croissance nouveau" }, { e: "\ud83d\udc3e", k: "animals animaux" }, { e: "\ud83c\udf24\ufe0f", k: "weather m\u00e9t\u00e9o" }] },
  { nm: ["Marks & symbols", "Marques & symboles"], items: [{ e: "\u2b50", k: "star favourite \u00e9toile favori" }, { e: "\u2728", k: "new highlight nouveau" }, { e: "\ud83d\udd37", k: "blue mark rep\u00e8re bleu" }, { e: "\ud83d\udd36", k: "orange mark rep\u00e8re orange" }, { e: "\ud83d\udfe3", k: "purple violet" }, { e: "\ud83d\udfe2", k: "green ok vert" }, { e: "\ud83d\udd34", k: "red urgent rouge urgent" }, { e: "\u26ab", k: "black noir" }, { e: "\ud83c\udde8\ud83c\udde6", k: "canada canada" }, { e: "#\ufe0f\u20e3", k: "number num\u00e9ro" }, { e: "\ud83d\udd20", k: "letters lettres" }, { e: "\u267e\ufe0f", k: "ongoing permanent" }] }
];

export default function EmojiPicker({ value, tr, lang, onPick, onClose }: {
  value?: string | null;
  tr: (o: { en: string; fr: string }) => string;
  lang: "en" | "fr";
  onPick: (mark: string | null) => void;
  onClose: () => void;
}) {
  // Open on whichever kind is already in use, so editing starts where you left off.
  const [tab, setTab] = useState<"icons" | "emoji">(isIconMark(value) ? "icons" : value ? "emoji" : "icons");
  const [q, setQ] = useState("");
  const ql = norm(q.trim());

  const icons = useMemo(() => ICON_GROUPS
    .map((g) => ({ ...g, hits: g.names.filter((n) => !ql || norm(n).includes(ql)) }))
    .filter((g) => g.hits.length), [ql]);
  const emoji = useMemo(() => EMOJI_GROUPS
    .map((g) => ({ ...g, hits: g.items.filter((i) => !ql || norm(i.k).includes(ql)) }))
    .filter((g) => g.hits.length), [ql]);

  const shown = tab === "icons" ? icons.reduce((n, g) => n + g.hits.length, 0)
                                : emoji.reduce((n, g) => n + g.hits.length, 0);

  const cell = (on: boolean): React.CSSProperties => ({
    width: 40, height: 40, padding: 0, cursor: "pointer", borderRadius: 9, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: on ? C.accent : C.cream, color: on ? "#fff" : C.accent,
    border: `1px solid ${on ? C.accent : C.line}`,
  });
  const tabStyle = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "11px 8px", textAlign: "center", fontSize: 13, fontWeight: 800,
    cursor: "pointer", color: on ? C.accent : C.muted,
    borderBottom: `2px solid ${on ? C.accent : "transparent"}`, background: on ? C.cream : "transparent",
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,19,26,.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, width: 460, maxWidth: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.line}` }}>
          <div style={tabStyle(tab === "icons")} onClick={() => setTab("icons")}>{tr(L("Icons", "Icônes"))}</div>
          <div style={tabStyle(tab === "emoji")} onClick={() => setTab("emoji")}>{tr(L("Emoji", "Emoji"))}</div>
        </div>

        <div style={{ padding: "12px 15px 0" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={tr(L("Search — vote, money, truck, meeting…", "Rechercher — vote, argent, camion, réunion…"))}
            style={{ width: "100%", border: "1.5px solid #E3E0D8", borderRadius: 10, padding: "8px 11px", fontSize: 13, background: "#FBFAF7", color: C.ink, outline: "none", fontFamily: "inherit" }} />
        </div>

        <div style={{ overflow: "auto", padding: "4px 15px 12px" }}>
          {shown === 0 && <div style={{ padding: "22px 2px", color: C.muted, fontSize: 13 }}>{tr(L("Nothing matches that.", "Aucun résultat."))}</div>}

          {tab === "icons" && icons.map((g) => (
            <div key={g.en}>
              <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", color: C.muted, margin: "12px 0 5px" }}>{lang === "fr" ? g.fr : g.en}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {g.hits.map((n) => {
                  const Ico = ICONS[n];
                  const mark = LUCIDE_PREFIX + n;
                  return (
                    <button key={n} title={n} onClick={() => { onPick(mark); onClose(); }} style={cell(value === mark)}>
                      <Ico size={19} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {tab === "emoji" && emoji.map((g) => (
            <div key={g.nm[0]}>
              <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", color: C.muted, margin: "12px 0 5px" }}>{lang === "fr" ? g.nm[1] : g.nm[0]}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {g.hits.map((i) => (
                  <button key={i.e} title={i.e} onClick={() => { onPick(i.e); onClose(); }}
                    style={{ ...cell(value === i.e), fontSize: 19, color: "inherit" }}>{i.e}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 15px", display: "flex", gap: 8, alignItems: "center" }}>
          <span onClick={() => { onPick(null); onClose(); }} style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, cursor: "pointer", padding: "7px 10px" }}>{tr(L("No mark", "Aucune marque"))}</span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted }}>{shown}</span>
          <span onClick={onClose} style={{ fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer", padding: "7px 10px" }}>{tr(L("Close", "Fermer"))}</span>
        </div>
      </div>
    </div>
  );
}
