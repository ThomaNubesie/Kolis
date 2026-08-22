// Quorly service layer — typed wrappers over the cf_* RPCs + cf-ai edge fn.
import { supabase } from "@/lib/supabase";

const rpc = async (fn: string, args?: any) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as any;
};

export type CfField = { id?: string; label: string; type: string; options?: string[]; required?: boolean };
export type CfMember = { id: string | null; name: string | null; color: string | null; role: string; status: string; contact: string | null };
export type CfComment = { id: string; author: string; body: string; created_at: string };
export type CfEntry = { id: string; seq: number; author: string; values: Record<string, any>; status: string | null; created_at: string; approvals: number; my_vote: string | null; comments: CfComment[] };
export type CfFormFull = { id: string; name: string; description: string; features: Record<string, boolean>; approval_count: number; is_admin: boolean; fields: CfField[]; members: CfMember[]; error?: string };
export type CfFormBrief = { id: string; name: string; description: string; features: Record<string, boolean>; is_admin: boolean; members: number };

export const cf = {
  myForms: (): Promise<CfFormBrief[]> => rpc("cf_my_forms"),
  form: (id: string): Promise<CfFormFull> => rpc("cf_form", { p_form: id }),
  entries: (id: string): Promise<CfEntry[]> => rpc("cf_entries", { p_form: id }),
  createForm: (p: { name: string; description?: string; features: any; approval: number; color: string; fields?: any[]; invites?: { contact: string }[] }) =>
    rpc("cf_create_form", { p_name: p.name, p_description: p.description ?? "", p_features: p.features, p_approval: p.approval, p_color: p.color, p_fields: p.fields ?? [], p_invites: p.invites ?? [] }),
  invite: async (form: string, contact: string) => {
    const res = await rpc("cf_invite", { p_form: form, p_contact: contact });
    if (res?.ok && res.token) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      try { await supabase.functions.invoke("cf-invite-send", { body: { token: res.token, base_url: base } }); } catch { /* best-effort */ }
    }
    return res;
  },
  join: (form: string, color: string) => rpc("cf_join", { p_form: form, p_color: color }),
  inviteInfo: (token: string): Promise<{ form_id?: string; form_name?: string; admin?: string; taken_colors?: string[]; error?: string }> => rpc("cf_invite_info", { p_token: token }),
  joinToken: (token: string, color: string) => rpc("cf_join_token", { p_token: token, p_color: color }),
  setColor: (form: string, color: string) => rpc("cf_set_color", { p_form: form, p_color: color }),
  setFeatures: (form: string, features: any, approval: number) => rpc("cf_set_features", { p_form: form, p_features: features, p_approval: approval }),
  setFields: (form: string, fields: any[]) => rpc("cf_set_fields", { p_form: form, p_fields: fields }),
  addEntry: (form: string, values: any) => rpc("cf_add_entry", { p_form: form, p_values: values }),
  editEntry: (entry: string, values: any) => rpc("cf_edit_entry", { p_entry: entry, p_values: values }),
  deleteEntry: (entry: string) => rpc("cf_delete_entry", { p_entry: entry }),
  addComment: (entry: string, body: string) => rpc("cf_add_comment", { p_entry: entry, p_body: body }),
  vote: (entry: string, value: "approve" | "reject") => rpc("cf_vote", { p_entry: entry, p_value: value }),
  async ai(action: "polish" | "translate", text: string, opts?: { tone?: string; target_lang?: string }) {
    const { data, error } = await supabase.functions.invoke("cf-ai", { body: { action, text, ...opts } });
    if (error) throw new Error(error.message);
    return data as { ok?: boolean; text?: string; error?: string };
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
