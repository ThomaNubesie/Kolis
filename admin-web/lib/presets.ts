// Quorly organization presets — "pick the shape and Quorly stands the whole thing up".
//
// A preset is a name, a set of officer titles, and the departments to create.
// It lives here (not in SQL) so the create screen can edit every line of it
// before `cf_create_org` runs — everything on that screen is meant to be
// editable. The server takes whatever the screen finally sends.
//
// Bilingual by the same rule as the form templates: `en` is the CANONICAL value
// answers are keyed under (cf_entries.values), `fr` is display-only and travels
// in the label_i18n sidecar.

export type PFType = "text" | "longtext" | "select" | "number" | "date" | "photo";
export type PField = { label: { en: string; fr: string }; type: PFType; required?: boolean; options?: { en: string; fr: string }[] };
export type PFeat = Partial<Record<"fields" | "member_entries" | "voting" | "ai" | "translation" | "comments" | "photos" | "election", boolean>>;

export type PDept = {
  id: string;
  name: { en: string; fr: string };
  blurb: { en: string; fr: string };   // the one-line "what this is" on the preset card
  icon: string;                         // lucide icon name, resolved by the screen
  kind?: "department" | "election";
  features: PFeat;
  approval?: number;
  fields?: PField[];
};

export type Preset = {
  id: string;
  name: { en: string; fr: string };
  sub: { en: string; fr: string };
  emoji: string;
  titles: { en: string; fr: string }[];  // the officer posts a group like this runs on
  depts: PDept[];
};

const L = (en: string, fr: string) => ({ en, fr });
const FEAT_OFF = { fields: false, member_entries: false, voting: false, ai: true, translation: true, comments: true, photos: false };

// ---------------------------------------------------------------- departments
const MINUTES: PDept = {
  id: "minutes", icon: "NotebookPen",
  name: L("Meeting minutes", "Procès-verbaux"),
  blurb: L("Decision, owner, due date · comments on", "Décision, responsable, échéance · commentaires"),
  features: { ...FEAT_OFF, fields: true, member_entries: true, comments: true },
  fields: [
    { label: L("Decision", "Décision"), type: "longtext", required: true },
    { label: L("Owner", "Responsable"), type: "text" },
    { label: L("Due", "Échéance"), type: "date" },
  ],
};

const MOTIONS: PDept = {
  id: "motions", icon: "Gavel",
  name: L("Board motions", "Motions du conseil"),
  blurb: L("Mover & seconder · passes at 2 votes", "Proposeur & second · adoptée à 2 votes"),
  features: { ...FEAT_OFF, fields: true, member_entries: true, voting: true }, approval: 2,
  fields: [
    { label: L("Motion", "Motion"), type: "longtext", required: true },
    { label: L("Mover", "Proposeur"), type: "text" },
    { label: L("Seconder", "Second"), type: "text" },
  ],
};

// The election department is seeded server-side (positions, candidacy fields and
// its Election folder) — it only needs the flag.
const ELECTION: PDept = {
  id: "election", icon: "Vote", kind: "election",
  name: L("Elections", "Élections"),
  blurb: L("Multi-position · certified results PDF", "Multi-postes · PDF de résultats certifiés"),
  features: { fields: true, member_entries: true, voting: true, comments: true, election: true },
};

const ledger = (id: string, name: { en: string; fr: string }, blurb: { en: string; fr: string }, icon = "Wallet"): PDept => ({
  id, icon, name, blurb,
  features: { ...FEAT_OFF, fields: true, member_entries: true, comments: true, photos: true },
  fields: [
    { label: L("Date", "Date"), type: "date" },
    { label: L("Description", "Description"), type: "text", required: true },
    { label: L("Category", "Catégorie"), type: "select", options: [L("Income", "Revenu"), L("Expense", "Dépense"), L("Transfer", "Virement")] },
    { label: L("Money in", "Entrées"), type: "number" },
    { label: L("Money out", "Sorties"), type: "number" },
    { label: L("Receipt", "Reçu"), type: "photo" },
    { label: L("Note", "Note"), type: "longtext" },
  ],
});

const TREASURY = ledger("treasury", L("Treasury & receipts", "Trésorerie & reçus"), L("Scanned receipts · expense report", "Reçus numérisés · rapport de dépenses"));
const LEVIES = ledger("levies", L("Levies & dues", "Charges & cotisations"), L("Who owes what, and when it cleared", "Qui doit quoi, et quand c'est réglé"), "Receipt");
const FUNDRAISING = ledger("fundraising", L("Fundraising", "Collecte de fonds"), L("Campaign income and costs in one place", "Revenus et coûts de campagne au même endroit"), "Receipt");
const DUES = ledger("dues", L("Membership dues", "Cotisations"), L("Season fees per member, paid or outstanding", "Frais de saison par membre, payés ou dus"), "Receipt");
const OFFERINGS = ledger("offerings", L("Offerings", "Offrandes"), L("Weekly count, logged and witnessed", "Comptage hebdomadaire, consigné et attesté"), "Receipt");

// Documents is a files-first department: no entry fields, just the dropbox.
const DOCUMENTS: PDept = {
  id: "documents", icon: "FolderOpen",
  name: L("Documents", "Documents"),
  blurb: L("Bylaws, policies · expiry reminders", "Règlements, politiques · rappels d'expiration"),
  features: { ...FEAT_OFF, fields: false, member_entries: true, comments: true },
};

const REGISTER: PDept = {
  id: "register", icon: "Users",
  name: L("Members register", "Registre des membres"),
  blurb: L("Roster with colours and roles", "Liste avec couleurs et fonctions"),
  features: { ...FEAT_OFF, fields: true, member_entries: true },
  fields: [
    { label: L("Name", "Nom"), type: "text", required: true },
    { label: L("Office held", "Fonction"), type: "text" },
    { label: L("Email", "Courriel"), type: "text" },
    { label: L("Phone", "Téléphone"), type: "text" },
    { label: L("Joined", "Adhésion"), type: "date" },
  ],
};

const EVENTS: PDept = {
  id: "events", icon: "CalendarDays",
  name: L("Events", "Événements"),
  blurb: L("What's planned, who's running it", "Ce qui est prévu, et qui s'en occupe"),
  features: { ...FEAT_OFF, fields: true, member_entries: true, comments: true },
  fields: [
    { label: L("Event", "Événement"), type: "text", required: true },
    { label: L("Date", "Date"), type: "date" },
    { label: L("Lead", "Responsable"), type: "text" },
    { label: L("Notes", "Notes"), type: "longtext" },
  ],
};

const ROSTER: PDept = {
  id: "roster", icon: "Users",
  name: L("Roster", "Effectif"),
  blurb: L("Players, positions and contacts", "Joueurs, positions et coordonnées"),
  features: { ...FEAT_OFF, fields: true, member_entries: true },
  fields: [
    { label: L("Name", "Nom"), type: "text", required: true },
    { label: L("Position", "Position"), type: "text" },
    { label: L("Contact", "Coordonnées"), type: "text" },
  ],
};

const SCHEDULE: PDept = {
  id: "schedule", icon: "CalendarDays",
  name: L("Schedule", "Calendrier"),
  blurb: L("Fixtures, times and venues", "Matchs, horaires et lieux"),
  features: { ...FEAT_OFF, fields: true, member_entries: true, comments: true },
  fields: [
    { label: L("Date", "Date"), type: "date" },
    { label: L("Opponent / activity", "Adversaire / activité"), type: "text", required: true },
    { label: L("Venue", "Lieu"), type: "text" },
  ],
};

// ------------------------------------------------------------------- presets
export const PRESETS: Preset[] = [
  {
    id: "nonprofit", emoji: "🏛️",
    name: L("Non-profit board", "Conseil d'administration"),
    sub: L("Directors, officers, motions", "Administrateurs, dirigeants, motions"),
    titles: [L("President", "Président"), L("Vice-president", "Vice-président"), L("Secretary", "Secrétaire"), L("Treasurer", "Trésorier"), L("Director", "Administrateur")],
    depts: [MINUTES, MOTIONS, ELECTION, TREASURY, DOCUMENTS, REGISTER],
  },
  {
    id: "condo", emoji: "🏢",
    name: L("Condo syndicate", "Syndicat de copropriété"),
    sub: L("Co-owners, levies, AGM", "Copropriétaires, charges, AG"),
    titles: [L("President", "Président"), L("Vice-president", "Vice-président"), L("Secretary", "Secrétaire"), L("Treasurer", "Trésorier"), L("Administrator", "Administrateur")],
    depts: [MINUTES, MOTIONS, LEVIES, ELECTION, DOCUMENTS, REGISTER],
  },
  {
    id: "pac", emoji: "🎓",
    name: L("School PAC", "Comité de parents"),
    sub: L("Parents, fundraising, events", "Parents, collectes, événements"),
    titles: [L("Chair", "Président"), L("Vice-chair", "Vice-président"), L("Secretary", "Secrétaire"), L("Treasurer", "Trésorier"), L("Parent rep", "Représentant des parents")],
    depts: [MINUTES, FUNDRAISING, EVENTS, DOCUMENTS, REGISTER],
  },
  {
    id: "club", emoji: "⚽",
    name: L("Sports club", "Club sportif"),
    sub: L("Roster, dues, schedule", "Effectif, cotisations, calendrier"),
    titles: [L("President", "Président"), L("Vice-president", "Vice-président"), L("Secretary", "Secrétaire"), L("Treasurer", "Trésorier"), L("Coach", "Entraîneur")],
    depts: [ROSTER, DUES, SCHEDULE, MINUTES, DOCUMENTS],
  },
  {
    id: "church", emoji: "⛪",
    name: L("Church council", "Conseil paroissial"),
    sub: L("Council, offerings, minutes", "Conseil, offrandes, procès-verbaux"),
    titles: [L("Pastor", "Pasteur"), L("Elder", "Ancien"), L("Secretary", "Secrétaire"), L("Treasurer", "Trésorier"), L("Deacon", "Diacre")],
    depts: [MINUTES, OFFERINGS, EVENTS, DOCUMENTS, REGISTER],
  },
  {
    id: "empty", emoji: "＋",
    name: L("Start empty", "Partir de zéro"),
    sub: L("Build it yourself", "Construisez-le vous-même"),
    titles: [L("President", "Président"), L("Secretary", "Secrétaire"), L("Treasurer", "Trésorier")],
    depts: [],
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

// A blank department: a free-text log the group can shape later.
export const BLANK: PDept = {
  id: "blank", icon: "FolderOpen",
  name: L("New department", "Nouveau département"),
  blurb: L("A plain log — add fields later", "Un journal simple — ajoutez des champs plus tard"),
  features: { ...FEAT_OFF, member_entries: true, comments: true },
};

// Offered on the organization's home screen, so the group can add what it needs
// the moment it needs it rather than deciding everything up front.
export const QUICK_ADD: PDept[] = [MINUTES, MOTIONS, ELECTION, TREASURY, DOCUMENTS, BLANK];

// ------------------------------------------------- what actually goes to the DB
// `label` is canonical (English) so answers key consistently; `label_i18n` and
// `options_i18n` ride along as the display translation, exactly as the form
// templates do today.
export function deptPayload(d: PDept, overrideName?: string) {
  return {
    name: overrideName ?? d.name.en,
    kind: d.kind ?? "department",
    description: "",
    group: null as string | null,
    features: d.features,
    approval: d.approval ?? 1,
    fields: (d.fields ?? []).map((f, i) => ({
      label: f.label.en,
      type: f.type,
      required: !!f.required,
      sort: i,
      options: (f.options ?? []).map((o) => o.en),
      label_i18n: f.label,
      options_i18n: (f.options ?? []).reduce<Record<string, { en: string; fr: string }>>((a, o) => { a[o.en] = o; return a; }, {}),
    })),
  };
}
