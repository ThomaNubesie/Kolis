// loadq-seat-reconcile — ask Stripe directly whether a seat was paid.
//
// Runs every minute on pg_cron. The webhook is the fast path, not the only path, and the
// latest session is not the only session. On 2026-09-14 a passenger paid on a link that was
// superseded 25 seconds later; the seat showed unpaid, the money sat in Stripe, and checking
// only the current session confirmed the wrong answer. This walks EVERY live session of every
// awaiting seat — a seat that is paid but shows unpaid physically holds up a car, because no
// car may depart owing.
//
// POST {}                              → sweep (what the cron calls)
// POST { seat_id } | { entry_id }      → narrow the sweep
// POST { payment_intent, seat_id? }    → attach a KNOWN charge to a seat
//
// Every path writes through loadq_seat_card_record, so the amount check, the idempotency and
// the evidence row are identical however the news arrives. A charge is never attached to a
// seat whose fare it does not match.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripe = new Stripe(KEY, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const when = (t?: number | null) => t ? new Date(t * 1000).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!KEY) return json({ ok: false, error: "stripe_not_configured" }, 500);
  const db = createClient(URL_, SRK, { auth: { persistSession: false } });

  try {
    const b = await req.json().catch(() => ({} as any));

    // ── attach a known charge ───────────────────────────────────────────────────────────
    if (b.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(String(b.payment_intent));
      const info: any = {
        payment_intent: pi.id, status: pi.status,
        amount: pi.amount, amount_received: pi.amount_received,
        currency: pi.currency, created: when(pi.created),
        live: pi.livemode, metadata: pi.metadata ?? {},
        last_error: (pi as any).last_payment_error?.message ?? null,
      };
      if (pi.status !== "succeeded") {
        return json({ ok: false, error: "not_succeeded", detail:
          "Stripe has not captured this payment, so no seat may be marked paid.", ...info });
      }
      let seatId: string | null = b.seat_id ?? (pi.metadata?.seat_id as string) ?? null;
      if (!seatId && pi.metadata?.reference) {
        const { data } = await db.from("loadq_seats").select("id")
          .ilike("reference", String(pi.metadata.reference)).maybeSingle();
        seatId = data?.id ?? null;
      }
      if (!seatId) {
        return json({ ok: false, error: "no_seat_given", detail:
          "The charge carries no seat_id and none was supplied. Pass seat_id explicitly.", ...info });
      }
      const { data, error } = await db.rpc("loadq_seat_card_record", {
        p_seat: seatId, p_intent: pi.id, p_amount: pi.amount_received ?? pi.amount,
        p_currency: pi.currency ?? "cad", p_event: "manual_attach",
        p_raw: pi as unknown as Record<string, unknown>,
      });
      if (error) return json({ ok: false, error: error.message, ...info });
      return json({ ok: !!data?.ok, seat_id: seatId, result: data, ...info });
    }

    // ── sweep every live session of every awaiting seat ──────────────────────────────────
    const { data: rows, error } = await db.rpc("loadq_seat_open_sessions",
      { p_seat: b.seat_id ?? null, p_entry: b.entry_id ?? null });
    if (error) return json({ ok: false, error: error.message }, 500);

    const out: any[] = [];
    const settled = new Set<string>();   // a seat paid on one session needs no further lookups

    for (const r of (rows ?? []) as any[]) {
      if (settled.has(r.seat_id)) continue;
      const rec: any = { seat_id: r.seat_id, seat_no: r.seat_no, reference: r.reference,
                         session_id: r.session_id,
                         live: String(r.session_id).startsWith("cs_live_") };
      try {
        const cs = await stripe.checkout.sessions.retrieve(r.session_id, { expand: ["payment_intent"] });
        rec.session_status = cs.status;
        rec.payment_status = cs.payment_status;
        rec.expires_at = when(cs.expires_at);
        const pi: any = cs.payment_intent;
        if (pi && typeof pi === "object") {
          rec.intent_status = pi.status;
          rec.last_error = pi.last_payment_error?.message ?? null;
        }
        // Recording 'expired' is what stops this session being asked about ever again.
        await db.from("loadq_seat_sessions")
          .update({ checked_at: new Date().toISOString(),
                    last_status: cs.payment_status, session_status: cs.status })
          .eq("session_id", r.session_id);

        if (cs.payment_status !== "paid") {
          rec.action = cs.status === "expired" ? "expired" : "still_unpaid";
          out.push(rec); continue;
        }
        const intent = typeof cs.payment_intent === "string" ? cs.payment_intent : pi?.id;
        const { data, error: re } = await db.rpc("loadq_seat_card_record", {
          p_seat: r.seat_id, p_intent: intent, p_amount: cs.amount_total,
          p_currency: cs.currency ?? "cad", p_event: "reconcile", p_raw: cs as unknown as Record<string, unknown>,
        });
        rec.action = re ? "error" : (data?.already ? "already" : data?.ok ? "marked_paid" : data?.error);
        if (re) rec.error = re.message;
        if (data?.ok || data?.already) settled.add(r.seat_id);
        if (data && !data.ok && data.error === "amount_mismatch") {
          rec.expected = data.expected; rec.received = data.received;
        }
      } catch (e) { rec.action = "error"; rec.error = String((e as Error)?.message ?? e); }
      out.push(rec);
    }

    const paid = out.filter((r) => r.action === "marked_paid");
    // Quiet when there is nothing to say: this runs 1440 times a day.
    if (paid.length) console.log("reconcile: settled", paid.map((p) => p.reference).join(", "));
    return json({ ok: true, sessions_checked: out.length,
                  seats_settled: settled.size, newly_paid: paid.length,
                  sessions: out });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
