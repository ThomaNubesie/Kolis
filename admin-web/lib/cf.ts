// Quorly service layer — typed wrappers over the cf_* RPCs + cf-ai edge fn.
import { quorly as supabase } from "@/lib/quorly";

const rpc = async (fn: string, args?: any) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as any;
};

// `label` is the canonical key answers are stored under; `label_i18n` / `options_i18n` are
// display-only translations seeded by a built-in template (null on admin-typed fields).
export type CfField = { id?: string; label: string; type: string; options?: string[]; required?: boolean; label_i18n?: { en: string; fr: string } | null; options_i18n?: Record<string, { en: string; fr: string }> | null };
// One person as offered to an office picker — always a row from the PARENT's roster,
// carrying the member_id the office RPCs validate against that parent.
export type CfOfficePerson = { member_id: string; user_id: string | null; name: string; contact: string | null; color: string | null; title: string | null };
export type CfMember = { id: string | null; member_id?: string; name: string | null; color: string | null; role: string; status: string; suspended?: boolean; contact: string | null; joined_at?: string | null };
export type CfComment = { id: string; author: string; body: string; created_at: string };
export type CfEntry = { id: string; seq: number; author: string; values: Record<string, any>; status: string | null; created_at: string; approvals: number; my_vote: string | null; comments: CfComment[] };
export type CfFormFull = { id: string; name: string; description: string; features: Record<string, boolean>; approval_count: number; is_admin: boolean; nda?: string | null; fields: CfField[]; members: CfMember[]; error?: string; require_2fa?: boolean; needs_2fa?: boolean; require_download_approval?: boolean; post_audience?: "all" | "active" | "suspended"; im_suspended?: boolean; adopt_rule?: "count" | "majority"; adopt_needed?: number };
export type CfDownloadReq = { id: string; file_id: string; file_name: string; created_at: string; requester_name: string; requester_color: string | null };
export type CfReceipt = { id: string; merchant: string | null; purchase_date: string | null; category: string | null; subtotal: number | null; tax: number | null; total: number | null; currency: string | null; image_path: string | null; aligns_with: string | null; status: "review" | "confirmed"; created_at: string; uploader_name: string; mine: boolean };
export type ReceiptFields = { merchant?: string; date?: string; category?: string; subtotal?: number | null; tax?: number | null; total?: number | null; currency?: string };
export type CfFormBrief = { id: string; name: string; description: string; features: Record<string, boolean>; is_admin: boolean; admin?: string | null; joined_at?: string | null; members: number; kind?: string; parent_id?: string | null; org_id?: string | null; group_name?: string | null };
export type CfFile = { id: string; name: string; path: string; size: number | null; mime: string | null; is_final: boolean; request_id: string | null; created_at: string; uploader_name: string; uploader_color: string | null; request_label: string | null; mine: boolean; folder_id: string | null; version?: number; starred?: boolean; has_link?: boolean; deleted_at?: string | null; expires_at?: string | null; reminder_days?: number[]; encrypted?: boolean; enc_iv?: string | null; priority?: "urgent" | "important" | "normal" | null; approvals?: number; decided?: boolean };
export type CfFilesView = "folder" | "all" | "shared" | "starred" | "deleted" | "expiring";
export type CfFileActivity = { action: string; meta: any; created_at: string; actor_name: string; actor_color: string | null };
export type CfDocComment = { id: string; body: string; created_at: string; author_name: string; author_color: string | null; mine: boolean };
export type CfDocDecision = { approve: number; reject: number; members: number; threshold: number; my_vote: "approve" | "reject" | null; decided: boolean };
export type LostGuide = { title?: string; authority?: string; report?: string[]; replace?: string[]; documents_needed?: string[]; fees?: string; timeline?: string; abroad?: string; official_links?: { label: string; url: string }[]; disclaimer?: string; raw?: string };
export type CfFolder = { id: string; name: string; parent_id: string | null; files: number; subfolders: number; color?: string | null; approvals?: number; decided?: boolean };
export type CfShare = { id: string; token: string; has_password: boolean; expires_at: string | null; allow_download: boolean; revoked: boolean; views: number } | null;
export type CfFileRequest = { id: string; label: string; required: boolean; created_at: string; fulfilled: number; total_members: number; mine: boolean };

// ===== Organizations & departments =====
// An ORGANIZATION is the container a group's whole life lives in; a DEPARTMENT
// is a board inside it (minutes, motions, an election, the treasury). "Office"
// is not a container — it is the post a person holds (CfOrgMember.title),
// picked from the organization's officer_titles.
export type CfOrg = { id: string; name: string; slug: string | null; org_type: string | null; color: string; legal_name: string | null; officer_titles: string[]; is_admin: boolean; my_title: string | null; members: number; invited: number; departments: number; plan?: string; plan_until?: string | null; member_limit?: number | null };

// Friendly bilingual message when an org RPC refuses because of the plan (member
// cap or a paid feature). Accepts a structured {error:'plan_limit',feature} result
// OR a thrown Error whose message contains 'plan_limit[:feature]'. null if not a
// plan limit. See the /pricing page + the gates in cf_plan_limits.
export function planLimitMsg(x: any, lang: "en" | "fr"): string | null {
  let feature: string | null = null;
  if (x && typeof x === "object" && x.error === "plan_limit") feature = x.feature || "feature";
  const m: string = (x && typeof x.message === "string") ? x.message : (typeof x === "string" ? x : "");
  if (!feature && m.includes("plan_limit")) feature = (m.split("plan_limit")[1] || "").replace(/^[:\s]+/, "").split(/[\s"']/)[0] || "feature";
  if (!feature) return null;
  const names: Record<string, [string, string]> = {
    members: ["You've reached your plan's member limit.", "Vous avez atteint la limite de membres de votre forfait."],
    elections: ["Elections are available on paid plans.", "Les élections sont offertes sur les forfaits payants."],
    receipts: ["Receipts & expense reports are available on paid plans.", "Les reçus et rapports de dépenses sont offerts sur les forfaits payants."],
    feature: ["This is a paid feature.", "Ceci est une fonction payante."],
  };
  const [en, fr] = names[feature] || names.feature;
  return (lang === "fr" ? fr : en) + (lang === "fr" ? " Voir les forfaits sur /pricing." : " See plans at /pricing.");
}
export type CfDept = { id: string; name: string; description: string; group_name: string; kind: string; emoji?: string | null; features: Record<string, boolean>; election_status: string | null; is_admin: boolean; members: number; entries: number; im_member: boolean };
export type CfOrgTree = CfOrg & { description: string; departments: CfDept[]; error?: string; home_template?: string | null; home_content?: any };
export type CfOrgMember = { member_id: string; id: string | null; name: string; contact: string | null; color: string | null; role: string; title: string | null; status: string; suspended?: boolean; joined_at: string | null; departments: number };

export type CfCandidate = { entry_id: string; author_id: string; name: string; position: string; running: string; plan: string; declared_at: string; for: number; against: number; net: number; my_vote: "for" | "against" | null; my_reason: string | null; winner: boolean };
export type CfVoteReason = { entry_id: string; candidate: string; position: string; value: "for" | "against"; reason: string; voter: string; created_at: string };
export type CfElection = { ok: boolean; error?: string; status: "open" | "closed"; closed_at: string | null; closed_by?: string | null; is_admin: boolean; positions: string[]; election_folder: string | null; my_candidacies: string[]; candidates: CfCandidate[]; reasons: CfVoteReason[] };

// ===== Town Hall =====
export type CfThReply = { id: string; body: string; created_at: string; author: string; author_color: string | null };
export type CfThComment = CfThReply & { replies: CfThReply[] };
export type CfThEntry = { id: string; seq: number; body: string; summary: string | null; created_at: string; author: string; author_color: string | null; mine: boolean; media: { path: string; kind: string }[]; for: number; against: number; my_vote: "for" | "against" | null; comments: CfThComment[] };
export type CfThTopic = { id: string; title: string; status: "open" | "closed"; created_at: string; closed_at: string | null; pdf_path: string | null };
export type CfThFeed = { is_admin: boolean; error?: string; topic: CfThTopic | null; entries: CfThEntry[] };

// ===== Announcements (live dated posts; org=assembly or a department) =====
export type CfAnnouncement = { id: string; body: string; deadline: string | null; created_at: string; author: string; author_color: string | null; can_delete: boolean };
export type CfAnnFeed = { error?: string; can_post: boolean; items: CfAnnouncement[] };

export const cf = {
  canCreate: (): Promise<boolean> => rpc("cf_can_create"),
  annList: (form: string): Promise<CfAnnFeed> => rpc("cf_ann_list", { p_form: form }),
  annAdd: (form: string, body: string, deadline: string | null) => rpc("cf_ann_add", { p_form: form, p_body: body, p_deadline: deadline }),
  annDelete: (id: string) => rpc("cf_ann_delete", { p_id: id }),
  annNotify: async (id: string) => { try { const { data } = await supabase.functions.invoke("cf-ann-notify", { body: { announcement_id: id, base_url: typeof window !== "undefined" ? window.location.origin : undefined } }); return data; } catch (e: any) { return { ok: false, error: e?.message }; } },
  myProfile: (): Promise<{ name?: string }> => rpc("cf_my_profile"),
  setProfile: (name: string) => rpc("cf_set_profile", { p_name: name }),
  myForms: (): Promise<CfFormBrief[]> => rpc("cf_my_forms"),
  myVault: (): Promise<string> => rpc("cf_my_vault"),   // personal private document vault (a kind='personal' form)
  mySpaces: (): Promise<CfOrg[]> => rpc("cf_my_spaces"),   // legacy alias for myOrgs
  formMeta: (form: string): Promise<{ kind: string; parent_id: string | null; parent_name: string | null; org_id: string | null; org_name: string | null; org_color: string | null; group_name: string | null; department_count: number; subform_count: number }> => rpc("cf_form_meta", { p_form: form }),
  subforms: (parent: string): Promise<{ id: string; name: string; group_name: string; is_admin: boolean; members: number; im_member: boolean }[]> => rpc("cf_subforms", { p_parent: parent }),

  // ===== Organizations =====
  myOrgs: (): Promise<CfOrg[]> => rpc("cf_my_orgs"),
  // Anon-callable: resolves quorly.ca/o/<slug> to identity only (id, name,
  // colour), so a signed-out visitor lands on a sign-in that carries the group's
  // own branding. Returns { error: "not_found" } for an unknown handle.
  orgBySlug: (slug: string): Promise<{ id: string; name: string; slug: string; color: string; org_type: string | null } | { error: string }> => rpc("cf_org_by_slug", { p_slug: slug }),
  orgTree: (org: string): Promise<CfOrgTree> => rpc("cf_org_tree", { p_org: org }),
  orgSetHome: (org: string, template: string | null, content: any) => rpc("cf_org_set_home", { p_org: org, p_template: template, p_content: content ?? {} }),
  // Home-page cover photo. Orgs either keep one of the offered /covers/*.jpg or
  // upload their own; the upload lands in the org's own cf-files folder, so the
  // same membership RLS that guards documents guards the cover (read via fileUrl).
  async uploadOrgCover(org: string, file: File): Promise<string> {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-70);
    const path = `${org}/cover/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("cf-files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) throw new Error(up.error.message);
    return path;
  },
  // Town Hall is the department every member belongs to. Creating it is idempotent,
  // and each call re-syncs its roster with the organization's, so calling it when the
  // org loads is how a newly joined member lands in the hall.
  ensureTownHall: (org: string): Promise<string | null> => rpc("cf_ensure_townhall", { p_org: org }),
  setDeptEmoji: (form: string, emoji: string | null) => rpc("cf_set_dept_emoji", { p_form: form, p_emoji: emoji }),
  // Suspension is a flag, not a status: the member keeps their seat and can still
  // read — what they lose is the floor. Who may post is set per board.
  setMemberSuspended: (member: string, on: boolean) => rpc("cf_set_member_suspended", { p_member: member, p_on: on }),
  setPostAudience: (form: string, audience: "all" | "active" | "suspended") => rpc("cf_set_post_audience", { p_form: form, p_audience: audience }),
  orgMembers: (org: string): Promise<CfOrgMember[]> => rpc("cf_org_members", { p_org: org }),
  departments: (org: string): Promise<{ id: string; name: string; group_name: string; kind: string; is_admin: boolean; members: number; im_member: boolean }[]> => rpc("cf_departments", { p_org: org }),
  // Take your seat in a department your organization already vouches for. Called
  // on open, so a member never sees "not a member" for a board of their own group.
  ensureMember: (form: string): Promise<{ ok: boolean; joined?: boolean; already?: boolean; error?: string }> => rpc("cf_ensure_member", { p_form: form }),

  createOrg: async (p: {
    name: string; orgType?: string | null; color?: string; slug?: string | null; legalName?: string | null;
    titles?: string[]; departments?: any[]; invites?: { contact: string; title?: string; lang?: string }[]; adminName?: string;
  }) => {
    const res = await rpc("cf_create_org", {
      p_name: p.name, p_org_type: p.orgType ?? null, p_color: p.color ?? "#2F3AA3",
      p_slug: p.slug ?? null, p_legal_name: p.legalName ?? null, p_titles: p.titles ?? [],
      p_departments: p.departments ?? [], p_invites: p.invites ?? [], p_admin_name: p.adminName ?? "",
    });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    // cf_create_org only records the invites; deliver them the same way forms do.
    if (res?.ok && res.org_id && (p.invites?.length ?? 0) > 0) res.delivery = await cf.sendInvites(res.org_id);
    return res as { ok: boolean; org_id: string; slug: string; departments: { id: string; name: string; kind: string }[]; delivery?: any };
  },

  createDepartment: async (org: string, d: { name: string; group?: string | null; description?: string; features?: any; approval?: number; fields?: any[]; kind?: "department" | "election" }) => {
    const res = await rpc("cf_create_department", {
      p_org: org, p_name: d.name, p_group: d.group ?? null, p_description: d.description ?? "",
      p_features: d.features ?? {}, p_approval: d.approval ?? 1, p_fields: d.fields ?? [], p_kind: d.kind ?? "department",
    });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; form_id: string; department_id: string };
  },

  // One invite per person, on the organization — membership reaches every
  // department by ancestry, so this is one email, not one per board.
  orgInvite: async (org: string, contact: string, title?: string | null, lang?: "en" | "fr") => {
    const res = await rpc("cf_org_invite", { p_org: org, p_contact: contact, p_title: title ?? null, p_lang: lang ?? null });
    if (res?.ok && res.token) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      try { const { data } = await supabase.functions.invoke("cf-invite-send", { body: { token: res.token, base_url: base } }); res.delivery = data; }
      catch (e: any) { res.delivery = { ok: false, error: e?.message }; }
    }
    return res as { ok: boolean; token?: string; code?: string; error?: string; delivery?: any };
  },

  setMemberTitle: (member: string, title: string | null) => rpc("cf_set_member_title", { p_member: member, p_title: title ?? null }),
  // Announce a position to the person who received it — email + MMS, both languages.
  // Call AFTER setMemberTitle succeeds; it reads the title back off the member row.
  notifyPosition: async (member: string): Promise<{ ok: boolean; title?: string; where?: string; email?: { ok: boolean }; sms?: { ok: boolean }; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("cf-position-notify", { body: { member_id: member } });
    if (error) throw new Error(error.message);
    return data as any;
  },
  orgUpdate: (org: string, p: { name?: string; description?: string; color?: string; orgType?: string; legalName?: string; titles?: string[] }) =>
    rpc("cf_org_update", { p_org: org, p_name: p.name ?? null, p_description: p.description ?? null, p_color: p.color ?? null, p_org_type: p.orgType ?? null, p_legal_name: p.legalName ?? null, p_titles: p.titles ?? null }),
  createSubform: async (parent: string, group: string, name: string) => {
    const res = await rpc("cf_create_subform", { p_parent: parent, p_group: group, p_name: name });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; form_id: string };
  },
  // ===== Offices are staffed FROM the parent, never by outside invitation =====
  // An office is a subdivision of its department: the Speaker's Office is staffed by
  // members of Parliament. Inviting an outsider directly into an office would put
  // someone inside the department's work without ever having joined the department.
  officeRoster: (parent: string): Promise<CfOfficePerson[]> => rpc("cf_office_roster", { p_parent: parent }),
  officeCandidates: (form: string): Promise<CfOfficePerson[]> => rpc("cf_office_candidates", { p_form: form }),
  officeAdd: async (form: string, memberIds: string[]) => {
    const res = await rpc("cf_office_add", { p_form: form, p_members: memberIds });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; added: number };
  },
  createOffice: async (parent: string, group: string, name: string, adminMemberId: string, memberIds: string[]) => {
    const res = await rpc("cf_create_office", { p_parent: parent, p_group: group, p_name: name, p_admin_member: adminMemberId, p_members: memberIds });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; form_id: string };
  },
  // Vote-only sub-form: any active member of the parent may create one; it is voting-enabled.
  // Used by co-admins (e.g. a "vote steward") who can create *only* this type.
  createVoteSubform: async (parent: string, group: string, name: string) => {
    const res = await rpc("cf_create_vote_subform", { p_parent: parent, p_group: group, p_name: name });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; form_id: string };
  },
  myRole: (form: string): Promise<string | null> => rpc("cf_my_role", { p_form: form }),
  // ===== Outreach console (admin-gated: qo_is_admin) =====
  outreachAdmin: (): Promise<boolean> => rpc("qo_is_admin"),
  outreachStats: (): Promise<Record<string, number>> => rpc("qo_stats"),
  outreachList: (filter?: string | null): Promise<any[]> => rpc("qo_list", { p_filter: filter ?? null }),
  outreachAdd: async (p: { name: string; email?: string; category?: string; contact?: string; region?: string; fit?: string }) => {
    const res = await rpc("qo_add", { p_name: p.name, p_email: p.email ?? null, p_category: p.category ?? null, p_contact: p.contact ?? null, p_region: p.region ?? null, p_fit: p.fit ?? null });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; id: string };
  },
  // The grounded finder: searches the web for real organizations and posts what it
  // verified into the same 'new' queue a human types into. Never sends anything.
  async outreachFind(opts?: { regions?: string[]; kinds?: string[]; limit?: number }): Promise<{ ok?: boolean; added?: number; found?: number; error?: string; dropped?: { org: string; why: string }[]; prospects?: { org_name: string; email: string; region?: string }[] }> {
    const { data, error } = await supabase.functions.invoke("quorly-prospect-finder", { body: opts ?? {} });
    if (error) throw new Error(error.message);
    return data as any;
  },
  // The exact email a prospect would receive, WITHOUT sending it. Approving queues a
  // real cold email, so the copy has to be answerable before anyone approves.
  async outreachRenderEmail(id: string, touch = 1): Promise<{ ok?: boolean; subject?: string; from?: string; reply_to?: string; html?: string; org_name?: string; touch?: number; error?: string }> {
    const { data, error } = await supabase.functions.invoke("quorly-outreach", { body: { action: "render", id, touch } });
    if (error) throw new Error(error.message);
    return data as any;
  },
  outreachApprove: (id: string) => rpc("qo_approve", { p_id: id }),
  outreachStage: (id: string, stage: string) => rpc("qo_set_stage", { p_id: id, p_stage: stage }),
  outreachStop: (id: string) => rpc("qo_stop", { p_id: id }),
  outreachResume: (id: string) => rpc("qo_resume", { p_id: id }),
  // ===== Elections (multi-position vote sub-forms) =====
  electionEnsureMember: (form: string): Promise<{ ok: boolean; joined?: boolean; already?: boolean; error?: string }> => rpc("cf_election_ensure_member", { p_form: form }),
  electionResults: (form: string): Promise<CfElection> => rpc("cf_election_results", { p_form: form }),
  // Co-admins on a department. Admin rights are per-form, so an org admin appoints
  // (say) the election's steward here; inside that department they are a full admin.
  deptAdmins: (form: string): Promise<{ ok: boolean; error?: string; can_appoint?: boolean; members?: { user_id: string; name: string; title: string | null; is_admin: boolean }[] }> =>
    rpc("cf_dept_admins", { p_form: form }),
  setDeptAdmin: (form: string, user: string, on: boolean) => rpc("cf_set_dept_admin", { p_form: form, p_user: user, p_on: on }),
  setPositions: async (form: string, positions: string[]) => {
    const res = await rpc("cf_set_positions", { p_form: form, p_positions: positions });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; positions: string[] };
  },
  declareCandidacy: async (form: string, position: string, running: string, plan: string) => {
    const res = await rpc("cf_declare_candidacy", { p_form: form, p_position: position, p_running: running, p_plan: plan });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; entry_id: string };
  },
  electionVote: async (entry: string, value: "for" | "against", reason: string) => {
    const res = await rpc("cf_election_vote", { p_entry: entry, p_value: value, p_reason: reason });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean };
  },
  closeElection: async (form: string) => {
    const res = await rpc("cf_close_election", { p_form: form });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as CfElection & { recipients: string[] };
  },
  createSpace: async (name: string, invites: { contact: string }[] = []) => {
    const res = await rpc("cf_create_space", { p_name: name, p_invites: invites });
    if (res && res.ok === false) throw new Error(res.error || "Failed");
    return res as { ok: boolean; form_id: string };
  },
  removeMember: (member: string) => rpc("cf_member_remove", { p_member: member }),
  setForm2fa: (form: string, on: boolean) => rpc("cf_form_set_2fa", { p_form: form, p_on: on }),
  setDownloadApproval: (form: string, on: boolean) => rpc("cf_form_set_download_approval", { p_form: form, p_on: on }),
  downloadRequest: (type: "file" | "receipt", id: string): Promise<{ status: "ok" | "approved" | "pending"; new?: boolean }> => rpc("cf_download_request", { p_type: type, p_id: id }),
  downloadRequests: (form: string): Promise<CfDownloadReq[]> => rpc("cf_download_requests_list", { p_form: form }),
  downloadDecide: (request: string, approve: boolean) => rpc("cf_download_decide", { p_request: request, p_approve: approve }),
  async downloadNotify(type: "file" | "receipt", id: string) {
    try { await supabase.functions.invoke("cf-download-notify", { body: { target_type: type, target_id: id, base_url: typeof window !== "undefined" ? window.location.origin : undefined } }); } catch { /* non-fatal */ }
  },
  // Smart receipts
  receipts: (form: string): Promise<CfReceipt[]> => rpc("cf_receipts_list", { p_form: form }),
  async readReceipt(imageB64: string, mime: string): Promise<ReceiptFields> {
    const { data, error } = await supabase.functions.invoke("cf-ai", { body: { action: "read_receipt", image_b64: imageB64, mime } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return (data.fields ?? {}) as ReceiptFields;
  },
  async uploadReceiptImage(form: string, file: File): Promise<string> {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-70);
    const path = `${form}/receipts/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("cf-files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) throw new Error(up.error.message);
    return path;
  },
  receiptAdd: (form: string, f: { merchant?: string | null; date?: string | null; category?: string | null; subtotal?: number | null; tax?: number | null; total?: number | null; currency?: string | null; image_path?: string | null; aligns?: string | null; status?: string }): Promise<string> =>
    rpc("cf_receipt_add", { p_form: form, p_merchant: f.merchant ?? null, p_date: f.date ?? null, p_category: f.category ?? null, p_subtotal: f.subtotal ?? null, p_tax: f.tax ?? null, p_total: f.total ?? null, p_currency: f.currency ?? "CAD", p_image_path: f.image_path ?? null, p_aligns: f.aligns ?? null, p_status: f.status ?? "confirmed" }),
  receiptUpdate: (id: string, f: { merchant?: string | null; date?: string | null; category?: string | null; subtotal?: number | null; tax?: number | null; total?: number | null; aligns?: string | null; status?: string }) =>
    rpc("cf_receipt_update", { p_id: id, p_merchant: f.merchant ?? null, p_date: f.date ?? null, p_category: f.category ?? null, p_subtotal: f.subtotal ?? null, p_tax: f.tax ?? null, p_total: f.total ?? null, p_aligns: f.aligns ?? null, p_status: f.status ?? null }),
  async receiptDelete(id: string) { const path = await rpc("cf_receipt_delete", { p_id: id }); if (path) await supabase.storage.from("cf-files").remove([path]).catch(() => {}); },

  // ===== Town Hall (shared per-org concerns board) =====
  thFeed: (org: string): Promise<CfThFeed> => rpc("th_feed", { p_org: org }),
  thOpenTopic: (org: string, title: string) => rpc("th_open_topic", { p_org: org, p_title: title }),
  thCloseTopic: (topic: string) => rpc("th_close_topic", { p_topic: topic }),
  thEntryAdd: (topic: string, body: string) => rpc("th_entry_add", { p_topic: topic, p_body: body }),
  thVote: (entry: string, value: "for" | "against") => rpc("th_vote", { p_entry: entry, p_value: value }),
  thComment: (entry: string, parent: string | null, body: string) => rpc("th_comment_add", { p_entry: entry, p_parent: parent, p_body: body }),
  thMediaAdd: (entry: string, path: string, kind: string) => rpc("th_media_add", { p_entry: entry, p_path: path, p_kind: kind }),
  async thUploadMedia(org: string, file: File): Promise<{ path: string; kind: string }> {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-70);
    const path = `${org}/townhall/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("cf-files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) throw new Error(up.error.message);
    return { path, kind: /^video\//.test(file.type) ? "video" : "image" };
  },
  thMediaUrl: async (path: string): Promise<string> => { const { data } = await supabase.storage.from("cf-files").createSignedUrl(path, 3600); return data?.signedUrl ?? ""; },
  thSummarize: async (org: string, entry: string) => { try { const { data } = await supabase.functions.invoke("cf-th-summarize", { body: { org_id: org, entry_id: entry } }); return data; } catch (e: any) { return { ok: false, error: e?.message }; } },
  thPublish: async (topic: string) => { try { const { data } = await supabase.functions.invoke("cf-th-publish", { body: { topic_id: topic } }); return data; } catch (e: any) { return { ok: false, error: e?.message }; } },
  form: (id: string): Promise<CfFormFull> => rpc("cf_form", { p_form: id }),
  // Asked once, before anything renders. A suspended member is outside the room: the
  // server already withholds every read, and the app shows them only that word.
  amSuspended: (org?: string): Promise<boolean> => rpc("cf_am_suspended", { p_org: org ?? null }),
  entries: (id: string): Promise<CfEntry[]> => rpc("cf_entries", { p_form: id }),
  createForm: async (p: { name: string; description?: string; features: any; approval: number; color: string; adminName?: string; fields?: any[]; invites?: { contact: string }[]; parent?: string | null; group?: string | null }) => {
    const res = await rpc("cf_create_form", { p_name: p.name, p_description: p.description ?? "", p_features: p.features, p_approval: p.approval, p_color: p.color, p_admin_name: p.adminName ?? "", p_fields: p.fields ?? [], p_invites: p.invites ?? [], p_parent: p.parent ?? null, p_group: p.group ?? null });
    // Fire the invites entered at creation time (cf_create_form only stores them).
    if (res?.ok && res.form_id && (p.invites?.length ?? 0) > 0) {
      res.delivery = await cf.sendInvites(res.form_id);
    }
    return res;
  },
  // Send pending invites for a form (email/SMS). Pass `contact` to resend just one. Returns { ok, sent, failed, results }.
  sendInvites: async (form: string, contact?: string, channel?: "email" | "sms") => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    try { const { data, error } = await supabase.functions.invoke("cf-invite-send", { body: { form_id: form, base_url: base, ...(contact ? { contact } : {}), ...(channel ? { channel } : {}) } }); if (error) throw error; return data; }
    catch (e: any) { return { ok: false, error: e?.message ?? "send_failed" }; }
  },
  deleteForm: (form: string) => rpc("cf_delete_form", { p_form: form }),
  // The member's own language wins later (cf_profiles.lang); `lang` here only records what
  // the admin was working in, so the very first email lands in a plausible language.
  setLang: (lang: "en" | "fr") => rpc("cf_set_lang", { p_lang: lang }),
  invite: async (form: string, contact: string, lang?: "en" | "fr") => {
    const res = await rpc("cf_invite", { p_form: form, p_contact: contact, p_lang: lang ?? null });
    if (res?.ok && res.token) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      try { const { data } = await supabase.functions.invoke("cf-invite-send", { body: { token: res.token, base_url: base } }); res.delivery = data; } catch (e: any) { res.delivery = { ok: false, error: e?.message }; }
    }
    return res;
  },
  // Invite several people at once: register each contact (cf_invite), then send all
  // newly-pending invites in a single cf-invite-send pass. Dedupes and trims input.
  inviteMany: async (form: string, contacts: string[], lang?: "en" | "fr") => {
    const cleaned = Array.from(new Set(contacts.map((c) => c.trim()).filter(Boolean)));
    const results: { contact: string; ok: boolean; error?: string }[] = [];
    for (const contact of cleaned) {
      try { const r = await rpc("cf_invite", { p_form: form, p_contact: contact, p_lang: lang ?? null }); results.push({ contact, ok: r?.ok !== false, error: r?.ok === false ? r.error : undefined }); }
      catch (e: any) { results.push({ contact, ok: false, error: e?.message ?? "failed" }); }
    }
    let delivery: any = null;
    if (results.some((r) => r.ok)) { delivery = await cf.sendInvites(form); }
    const added = results.filter((r) => r.ok).length;
    const already = results.filter((r) => r.error === "already_invited").length;
    const invalid = results.filter((r) => r.error === "invalid_contact").length;
    const failed = results.filter((r) => !r.ok && r.error !== "already_invited" && r.error !== "invalid_contact");
    return { added, already, invalid, failed, delivery, results };
  },
  join: (form: string, color: string) => rpc("cf_join", { p_form: form, p_color: color }),
  inviteInfo: (token: string): Promise<{ form_id?: string; form_name?: string; admin?: string; taken_colors?: string[]; error?: string }> => rpc("cf_invite_info", { p_token: token }),
  resolveCode: (code: string): Promise<{ ok: boolean; token?: string; error?: string }> => rpc("cf_resolve_code", { p_code: code }),
  joinToken: (token: string, color: string, name?: string) => rpc("cf_join_token", { p_token: token, p_color: color, p_name: name ?? "" }),
  setColor: (form: string, color: string) => rpc("cf_set_color", { p_form: form, p_color: color }),
  setNda: (form: string, text: string) => rpc("cf_set_nda", { p_form: form, p_text: text }),
  updateForm: (form: string, name: string, description: string) => rpc("cf_update_form", { p_form: form, p_name: name, p_description: description }),
  sendPdf: async (form: string, opts: { filename: string; pdf_base64: string; recipients: string[]; message?: string }) => {
    const { data, error } = await supabase.functions.invoke("cf-send-pdf", { body: { form_id: form, ...opts } });
    if (error) throw error; return data as { ok?: boolean; sent?: number; error?: string };
  },
  setFeatures: (form: string, features: any, approval: number) => rpc("cf_set_features", { p_form: form, p_features: features, p_approval: approval }),
  setFields: (form: string, fields: any[]) => rpc("cf_set_fields", { p_form: form, p_fields: fields }),
  addEntry: (form: string, values: any) => rpc("cf_add_entry", { p_form: form, p_values: values }),
  editEntry: (entry: string, values: any) => rpc("cf_edit_entry", { p_entry: entry, p_values: values }),
  deleteEntry: (entry: string) => rpc("cf_delete_entry", { p_entry: entry }),
  addComment: (entry: string, body: string) => rpc("cf_add_comment", { p_entry: entry, p_body: body }),
  vote: (entry: string, value: "approve" | "reject") => rpc("cf_vote", { p_entry: entry, p_value: value }),
  // Files — per-form shared workspace (Supabase Storage bucket cf-files, per-form RLS).
  files: (form: string, folder?: string | null, view: CfFilesView = "folder"): Promise<CfFile[]> => rpc("cf_files_list", { p_form: form, p_folder: folder ?? null, p_view: view }),
  filesCounts: (form: string): Promise<{ all: number; shared: number; starred: number; deleted: number; requests: number }> => rpc("cf_files_counts", { p_form: form }),
  fileActivity: (file: string): Promise<CfFileActivity[]> => rpc("cf_file_activity_list", { p_file: file }),
  // Comments + approve/reject voting on files/folders (reach a decision).
  docComments: (type: "file" | "folder", id: string): Promise<CfDocComment[]> => rpc("cf_doc_comments_list", { p_type: type, p_id: id }),
  docCommentAdd: (type: "file" | "folder", id: string, body: string) => rpc("cf_doc_comment_add", { p_type: type, p_id: id, p_body: body }),
  docVote: (type: "file" | "folder", id: string, value: "approve" | "reject") => rpc("cf_doc_vote", { p_type: type, p_id: id, p_value: value }),
  docDecision: (type: "file" | "folder", id: string): Promise<CfDocDecision> => rpc("cf_doc_decision", { p_type: type, p_id: id }),
  fileStar: (file: string, on: boolean) => rpc("cf_file_star", { p_file: file, p_on: on }),
  setPriority: (file: string, level: "urgent" | "important" | "normal" | null) => rpc("cf_file_set_priority", { p_file: file, p_priority: level }),
  fileRestore: (file: string) => rpc("cf_file_restore", { p_file: file }),
  async filePurge(file: string) {
    const paths = await rpc("cf_file_purge", { p_file: file });
    if (Array.isArray(paths) && paths.length) await supabase.storage.from("cf-files").remove(paths).catch(() => {});
  },
  fileRequests: (form: string): Promise<CfFileRequest[]> => rpc("cf_file_requests_list", { p_form: form }),
  fileRequestAdd: (form: string, label: string, required = true) => rpc("cf_file_request_add", { p_form: form, p_label: label, p_required: required }),
  fileRequestDelete: (id: string) => rpc("cf_file_request_delete", { p_request: id }),
  async fileUpload(form: string, file: File, opts?: { requestId?: string | null; isFinal?: boolean; folderId?: string | null }) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${form}/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("cf-files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) throw new Error(up.error.message);
    const id = await rpc("cf_file_add", { p_form: form, p_name: file.name, p_path: path, p_size: file.size, p_mime: file.type || null, p_request: opts?.requestId ?? null, p_is_final: !!opts?.isFinal });
    if (opts?.folderId) { try { await rpc("cf_file_move", { p_file: id, p_folder: opts.folderId }); } catch { /* ignore */ } }
    return id;
  },
  // Folders
  folders: (form: string, parent?: string | null): Promise<CfFolder[]> => rpc("cf_folders_list", { p_form: form, p_parent: parent ?? null }),
  folderPath: (folder: string): Promise<{ id: string; name: string }[]> => rpc("cf_folder_path", { p_folder: folder }),
  folderAdd: (form: string, name: string, parent?: string | null): Promise<string> => rpc("cf_folder_add", { p_form: form, p_name: name, p_parent: parent ?? null }),
  folderRename: (folder: string, name: string) => rpc("cf_folder_rename", { p_folder: folder, p_name: name }),
  folderColor: (folder: string, color: string | null) => rpc("cf_folder_set_color", { p_folder: folder, p_color: color }),
  folderDelete: (folder: string) => rpc("cf_folder_delete", { p_folder: folder }),
  fileMove: (file: string, folder: string | null) => rpc("cf_file_move", { p_file: file, p_folder: folder }),
  fileRename: (file: string, name: string) => rpc("cf_file_rename", { p_file: file, p_name: name }),
  // Versions — re-upload same file → new version; keep history.
  async fileNewVersion(form: string, fileId: string, file: File) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${form}/${crypto.randomUUID()}-${safe}`;
    const up = await supabase.storage.from("cf-files").upload(path, file, { contentType: file.type || undefined });
    if (up.error) throw new Error(up.error.message);
    return rpc("cf_file_new_version", { p_file: fileId, p_path: path, p_size: file.size, p_mime: file.type || null });
  },
  fileVersions: (file: string): Promise<{ current: any; history: any[] }> => rpc("cf_file_versions_list", { p_file: file }),
  fileRestoreVersion: (version: string) => rpc("cf_file_restore_version", { p_version: version }),
  // Share links
  shareGet: (file: string): Promise<CfShare> => rpc("cf_share_get", { p_file: file }),
  shareCreate: (file: string, opts?: { password?: string | null; expiresDays?: number | null; allowDownload?: boolean }): Promise<{ id: string; token: string }> =>
    rpc("cf_share_create", { p_file: file, p_password: opts?.password ?? null, p_expires_days: opts?.expiresDays ?? null, p_allow_download: opts?.allowDownload ?? true }),
  shareRevoke: (file: string) => rpc("cf_share_revoke", { p_file: file }),
  // Send a file to someone — secure link (default) or attachment. Member-gated in the edge fn.
  async sendFile(file: string, opts: { to: string[]; message?: string; mode?: "link" | "attach" }) {
    const { data, error } = await supabase.functions.invoke("cf-send-file", { body: { file_id: file, to: opts.to, message: opts.message ?? "", mode: opts.mode ?? "link", base_url: typeof window !== "undefined" ? window.location.origin : undefined } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as { ok: boolean; sent: number; mode: string };
  },
  // Expiry + owner-chosen reminder schedule (days-before). p_date null clears it.
  setExpiry: (file: string, date: string | null, reminderDays: number[] = [30, 7, 1]) => rpc("cf_file_set_expiry", { p_file: file, p_date: date, p_reminder_days: reminderDays }),
  // End-to-end encryption (zero-knowledge). Vault key material is a non-secret salt + verifier.
  e2eInfo: (): Promise<{ has_vault: boolean; salt: string | null; check: string | null }> => rpc("cf_e2e_info"),
  e2eSetup: (salt: string, check: string): Promise<{ ok: boolean; already?: boolean }> => rpc("cf_e2e_setup", { p_salt: salt, p_check: check }),
  async fileUploadEncrypted(form: string, file: File, key: CryptoKey, opts?: { folderId?: string | null }) {
    const { encryptBlob } = await import("./e2e");
    const { blob, iv } = await encryptBlob(key, file);
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${form}/${crypto.randomUUID()}-${safe}.enc`;
    const up = await supabase.storage.from("cf-files").upload(path, blob, { contentType: "application/octet-stream" });
    if (up.error) throw new Error(up.error.message);
    const id = await rpc("cf_file_add", { p_form: form, p_name: file.name, p_path: path, p_size: blob.size, p_mime: file.type || null, p_request: null, p_is_final: false, p_encrypted: true, p_enc_iv: iv });
    if (opts?.folderId) { try { await rpc("cf_file_move", { p_file: id, p_folder: opts.folderId }); } catch { /* ignore */ } }
    return id;
  },
  async fileBlob(path: string): Promise<Blob> {
    const { data, error } = await supabase.storage.from("cf-files").download(path);
    if (error) throw new Error(error.message);
    return data;
  },
  async fileSavePdf(form: string, filename: string, blob: Blob) {
    const path = `${form}/${crypto.randomUUID()}-${filename.replace(/[^\w.\-]+/g, "_")}`;
    const up = await supabase.storage.from("cf-files").upload(path, blob, { contentType: "application/pdf" });
    if (up.error) throw new Error(up.error.message);
    return rpc("cf_file_add", { p_form: form, p_name: filename, p_path: path, p_size: blob.size, p_mime: "application/pdf", p_request: null, p_is_final: true });
  },
  async fileUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from("cf-files").createSignedUrl(path, 3600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  async fileDelete(id: string) {
    const path = await rpc("cf_file_delete", { p_file: id });
    if (path) await supabase.storage.from("cf-files").remove([path]).catch(() => {});
  },
  // ===== Auto-translation (see lib/autotranslate.tsx) =====
  // The cache is keyed by a hash of the source text, so a lookup requires already
  // holding the source, and a sentence is paid for once across the whole product.
  trGet: (hashes: string[], lang: "en" | "fr"): Promise<Record<string, string>> => rpc("cf_tr_get", { p_h: hashes, p_lang: lang }),
  trPut: (items: { h: string; src: string; out: string }[], lang: "en" | "fr") => rpc("cf_tr_put", { p_items: items, p_lang: lang }),
  async translateBatch(items: { k: string; text: string }[], targetLang: string): Promise<{ ok?: boolean; items?: { k: string; text: string }[] }> {
    const { data, error } = await supabase.functions.invoke("cf-ai", { body: { action: "translate_batch", items, target_lang: targetLang } });
    if (error) throw new Error(error.message);
    return data as any;
  },
  async ai(action: "polish" | "translate", text: string, opts?: { tone?: string; target_lang?: string }) {
    const { data, error } = await supabase.functions.invoke("cf-ai", { body: { action, text, ...opts } });
    if (error) throw new Error(error.message);
    return data as { ok?: boolean; text?: string; error?: string };
  },
  // Lost-document replacement guide: recognizes the issuing authority for a doc type + locality.
  async lostGuide(docType: string, locality: string, lang: "en" | "fr", lostLocation?: string): Promise<LostGuide> {
    const { data, error } = await supabase.functions.invoke("cf-ai", { body: { action: "lost_guide", doc_type: docType, locality, lost_location: lostLocation ?? "", lang } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data.guide as LostGuide;
  },
  // Live updates for a form's entries/comments/votes.
  subscribe(formId: string, onChange: () => void) {
    return supabase
      .channel(`cf_${formId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cf_entries", filter: `form_id=eq.${formId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "cf_comments" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "cf_votes" }, onChange)
      .subscribe();
  },
};
