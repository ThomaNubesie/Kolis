// kolis-nudge-unverified: staff push to unverified members reminding them what
// they're missing until they verify (can't accept deliveries; lose their free
// founding spot). Caller must be staff with the 'members' capability.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    // Only staff who hold the Members capability may message members in bulk.
    const { data: allowed } = await userClient.rpc("kolis_admin_has_cap", { p_cap: "members" });
    if (!allowed) return json({ error: "forbidden" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const onlyId: string | undefined = body?.user_id; // optional: nudge one member

    let qy = admin.from("kolis_profiles").select("id, role, push_token")
      .eq("identity_verified", false).not("push_token", "is", null);
    if (onlyId) qy = qy.eq("id", onlyId);
    const { data: members } = await qy;

    const title = "Finish verifying your Kolis account\nVérifiez votre compte Kolis";
    const courierBody =
      "You can't accept deliveries or earn until your ID is verified — and your free founding spot (first 100 per role) won't be held forever. Open Kolis to verify; it takes a minute.\n" +
      "Vous ne pouvez pas accepter de livraisons ni gagner tant que votre identité n'est pas vérifiée — et votre place de fondateur gratuite ne sera pas réservée indéfiniment. Ouvrez Kolis pour vérifier; ça prend une minute.";
    const senderBody =
      "Verify your identity to unlock your account and claim your free founding spot (first 100 per role) before it's gone. Open Kolis to verify; it takes a minute.\n" +
      "Vérifiez votre identité pour activer votre compte et réclamer votre place de fondateur gratuite (100 premiers par rôle) avant qu'elle ne disparaisse. Ouvrez Kolis pour vérifier; ça prend une minute.";

    const queue = (members ?? []).map((m: any) => ({
      to: m.push_token,
      title,
      body: (m.role === "courier" || m.role === "both") ? courierBody : senderBody,
      sound: "default",
      priority: "high",
      data: { type: "kolis_verify_nudge" },
    }));

    for (let i = 0; i < queue.length; i += 100) {
      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(queue.slice(i, i + 100)),
        });
      } catch { /* best-effort */ }
    }
    return json({ ok: true, nudged: queue.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
