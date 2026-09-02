// LoadQ — onboard a new driver from the daily sheet.
//
// A new person turns up at the pickup point. The list writer (Thomas or
// Dieudonné) takes their name, phone, email, car and photos of their licence and
// insurance, and they are on the line before the conversation is over.
//
// Why an edge function and not a plain RPC: `drivers.id` references
// `auth.users(id)`, so a driver CANNOT exist without an auth account, and
// creating one needs the service_role key — which must never sit on a tablet in
// a parking lot. So the privileged half lives here:
//
//   here (service key)                 create the auth user + the drivers row
//   loadq_list_onboard (writer-gated)  car, documents, alias, queue placement
//
// ⚠ NO IMPORTS ON PURPOSE. These functions are deployed through the Management
// API, which ships raw source WITHOUT bundling, so any remote import (esm.sh,
// jsr, deno.land) fails at boot with an opaque BOOT_ERROR. Verified by bisection
// on 2026-09-01: a no-import function boots, `import ... from "https://esm.sh/
// @supabase/supabase-js"` does not, and neither does the jsr equivalent. So this
// talks to PostgREST and the Auth Admin API over plain fetch. Do not "tidy" it
// by reintroducing supabase-js unless the deploy path also changes.
//
// The account is created against the driver's REAL email, so they can sign in
// later and finish their own verification — better than another ".temp@"
// placeholder. They are NOT marked verified: the documents land in the same
// admin review queue every other driver goes through.

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const svc = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  ...extra,
});

const e164 = (p?: string | null) => {
  if (!p) return null;
  const n = String(p).replace(/[^\d+]/g, "");
  if (!n) return null;
  return n.startsWith("+") ? n : n.length === 10 ? "+1" + n : "+" + n;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    if (!URL_ || !SERVICE) return json({ ok: false, error: "server_misconfigured" }, 500);

    // ---- 1. who is calling? ------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "no_token" }, 401);

    const meRes = await fetch(`${URL_}/auth/v1/user`, {
      headers: { apikey: SERVICE, Authorization: authHeader },
    });
    if (!meRes.ok) return json({ ok: false, error: "invalid_token" }, 401);
    const me = await meRes.json();
    const uid: string | undefined = me?.id;
    if (!uid) return json({ ok: false, error: "invalid_token" }, 401);

    // ---- 2. are they allowed to write the sheet? ---------------------------
    // Asked of the database, never taken from the client.
    const [wRes, aRes] = await Promise.all([
      fetch(`${URL_}/rest/v1/loadq_list_writer?driver_id=eq.${uid}&select=driver_id`, { headers: svc() }),
      fetch(`${URL_}/rest/v1/drivers?id=eq.${uid}&select=is_admin`, { headers: svc() }),
    ]);
    const writer = wRes.ok ? await wRes.json() : [];
    const adm = aRes.ok ? await aRes.json() : [];
    if (!writer.length && !adm?.[0]?.is_admin) return json({ ok: false, error: "not_a_list_writer" }, 403);

    // ---- 3. validate ------------------------------------------------------
    const b = await req.json().catch(() => ({}));
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const phone = e164(b.phone);
    const seats = Number(b.seats ?? 0);

    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "valid_email_required" }, 400);
    if (!Number.isInteger(seats) || seats < 1 || seats > 14) return json({ ok: false, error: "seats_required" }, 400);
    if (!b.zone || !b.dest) return json({ ok: false, error: "zone_and_dest_required" }, 400);

    const dupRes = await fetch(
      `${URL_}/rest/v1/drivers?email=eq.${encodeURIComponent(email)}&select=id,full_name`, { headers: svc() });
    const dup = dupRes.ok ? await dupRes.json() : [];
    if (dup.length) return json({ ok: false, error: "driver_exists", driver_id: dup[0].id, name: dup[0].full_name }, 409);

    // ---- 4. create the auth user (needs the service key) -------------------
    // email_confirm so they can sign in with a code immediately, without having
    // to open a confirmation link while standing at the kerb.
    const cuRes = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST",
      headers: svc(),
      body: JSON.stringify({
        email, phone: phone ?? undefined, email_confirm: true,
        user_metadata: { full_name: name, onboarded_by: uid, onboarded_via: "loadq_sheet" },
      }),
    });
    const cu = await cuRes.json().catch(() => ({}));
    if (!cuRes.ok || !cu?.id) {
      const msg = String(cu?.msg ?? cu?.message ?? cu?.error_description ?? "create_user_failed");
      const already = /already|registered|exists|duplicate/i.test(msg);
      return json({ ok: false, error: already ? "email_already_registered" : "create_user_failed", detail: msg },
        already ? 409 : 400);
    }
    const newId: string = cu.id;

    // ---- 5. the drivers row (FK to auth.users now satisfied) ---------------
    const dRes = await fetch(`${URL_}/rest/v1/drivers`, {
      method: "POST",
      headers: svc({ Prefer: "return=minimal" }),
      body: JSON.stringify({ id: newId, full_name: name, email, phone, verified: false, blocked: false }),
    });
    if (!dRes.ok) {
      const detail = await dRes.text();
      // Never leave an orphan auth user behind.
      await fetch(`${URL_}/auth/v1/admin/users/${newId}`, { method: "DELETE", headers: svc() }).catch(() => {});
      return json({ ok: false, error: "create_driver_failed", detail: detail.slice(0, 300) }, 400);
    }

    // ---- 6. car, documents, alias, queue — AS THE CALLER, so the writer gate
    //         and `added_by` attribution apply to the real person.
    const rpcRes = await fetch(`${URL_}/rest/v1/rpc/loadq_list_onboard`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_zone: b.zone, p_dest: b.dest, p_driver: newId,
        p_make: b.make ?? null, p_model: b.model ?? null, p_color: b.color ?? null,
        p_seats: seats, p_plate: b.plate ?? null, p_type: b.vehicle_type ?? "suv",
        p_pos: b.position ?? null, p_alias: b.alias ?? null,
        p_license_path: b.license_path ?? null, p_insurance_path: b.insurance_path ?? null,
        p_license_expires: b.license_expires ?? null, p_license_number: b.license_number ?? null,
      }),
    });
    const onboard = await rpcRes.json().catch(() => null);
    if (!rpcRes.ok) {
      return json({ ok: false, error: "onboard_failed", detail: String(onboard?.message ?? "").slice(0, 300),
        driver_id: newId }, 400);
    }

    return json({ ...(onboard ?? {}), driver_id: newId, email, auth_created: true });
  } catch (e) {
    return json({ ok: false, error: "unhandled", detail: String((e as Error)?.message ?? e) }, 500);
  }
});
