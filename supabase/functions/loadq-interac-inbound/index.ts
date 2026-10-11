// loadq-interac-inbound — auto-match an Interac deposit to a LoadQ ride/pickup (LQ- refs)
// OR a Kolis Freight booking (KF- refs) and mark it paid. Called by the Gmail Apps Script
// that reads Interac "you received $X" emails. POST ?key=<LOADQ_INTERAC_TOKEN>
// { reference|text, amount_cents?, amount?, sender_name?, sender_email?, raw_text? }
//
// EVERY ATTEMPT IS WRITTEN DOWN. loadq_interac_inbound existed for a month before anything
// wrote to it, and two things depended on that: loadq_interac_unresolved (the queue of
// deposits nobody could place) was permanently empty, and loadq_payout_verify counts a paid
// Interac seat with no inbound row as `interac_not_backed` — a BLOCKING issue, so the first
// entry sold by e-transfer would have refused to verify with no clue as to why.
//
// The logging is deliberately subordinate to the money: it runs after the match, and any
// failure in it is swallowed. A payment must never fail because an audit row would not write.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// NOT `URL`: naming it that shadows the global URL class for the whole module,
// and `new URL(req.url)` in the handler then throws TypeError before the try
// block — a 500 on every request, including the unauthorized ones. That is
// exactly what v7 did on 24 August when the KF- branch introduced this line,
// and no Interac payment has been matched since.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TOKEN = Deno.env.get("LOADQ_INTERAC_TOKEN") || "";
// Was a literal in this file. Reads from the environment now and falls back to the old value,
// so nothing breaks before the secret is set, and setting it is all that is needed to retire
// a credential that is sitting in git history.
const KOLIS_SECRET = Deno.env.get("KOLIS_NOTIFY_SECRET") || "kolis_notify_9f3a2c7b1e6d4084";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The payer's name, which is in the body — `from` on the email is Interac, not the customer. */
function senderFrom(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/Sent From:\s*(.+)/i);
  return m ? m[1].trim().slice(0, 120) : null;
}

/**
 * Keep enough of the email to settle an argument later, and nothing that is a credential.
 * The Interac notice carries a tokenised manage-preferences link that changes notification
 * settings for whoever holds it; that does not belong in a table.
 */
function safeText(text: string | null): string | null {
  if (!text) return null;
  return text
    .replace(/https?:\/\/\S*tkn=\S+/gi, "[preferences link removed]")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 1500);
}

type Outcome = {
  matched: boolean;
  kind?: string | null;
  request_id?: string | null;
  note?: string | null;
};

/**
 * One row per (reference, amount), updated on every retry — the script re-posts an unmatched
 * deposit every five minutes for three days, which would otherwise be ~860 rows for one
 * transfer. Never throws: the caller has already decided about the money.
 */
async function record(
  reference: string | null,
  amount_cents: number | null,
  body: Record<string, unknown>,
  out: Outcome,
) {
  try {
    const raw = safeText((body.raw_text as string) ?? (body.text as string) ?? null);
    const row: Record<string, unknown> = {
      amount_cents,
      reference,
      sender_name: (body.sender_name as string) ?? senderFrom(raw),
      sender_email: (body.sender_email as string) ?? null,
      raw_text: raw,
      matched: out.matched === true,
      match_kind: out.kind ?? null,
      request_id: out.request_id && UUID.test(out.request_id) ? out.request_id : null,
      note: out.note ? String(out.note).slice(0, 500) : null,
    };
    // A deposit with no reference has no key to collide on — NULLs are distinct in a unique
    // index — so those simply insert, which is right: they are different payments.
    if (reference) {
      await admin.from("loadq_interac_inbound")
        .upsert(row, { onConflict: "reference,amount_cents" });
    } else {
      await admin.from("loadq_interac_inbound").insert(row);
    }
  } catch (e) {
    // Deliberately swallowed. Losing the audit row is bad; failing the payment because the
    // audit row would not write is worse, and the Apps Script would then retry a transfer
    // that has already been marked paid.
    console.error("interac log failed", String((e as Error)?.message ?? e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  // Unauthorized callers are not logged: the table is a record of deposits, not a place for
  // anyone who can reach the URL to write rows.
  if (!TOKEN || key !== TOKEN) return json({ error: "unauthorized" }, 401);

  let b: Record<string, unknown> = {};
  let reference: string | null = null;
  let amount_cents: number | null = null;

  try {
    b = await req.json().catch(() => ({}));
    reference = (b.reference as string) ?? null;
    const text = (b.text as string) ?? (b.raw_text as string) ?? null;
    if (!reference && typeof text === "string") {
      const m = text.match(/\b(?:LQ|KF)-[A-Z0-9]{4,6}\b/i);
      if (m) reference = m[0];
    }
    amount_cents = b.amount_cents != null ? Math.round(Number(b.amount_cents))
      : (b.amount != null ? Math.round(Number(b.amount) * 100) : null);
    if (amount_cents != null && !Number.isFinite(amount_cents)) amount_cents = null;

    if (!reference) {
      // Worth a row: a deposit nobody could place is exactly what the queue is for.
      await record(null, amount_cents, b, { matched: false, note: "no_reference" });
      return json({ matched: false, reason: "no_reference" });
    }
    reference = reference.toUpperCase();

    // Kolis Freight booking (KF- refs) → delegate to kolis-freight-book.
    if (reference.startsWith("KF-")) {
      try {
        const r = await fetch(`${SB_URL}/functions/v1/kolis-freight-book`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-kolis-secret": KOLIS_SECRET },
          body: JSON.stringify({ action: "interac_match", pay_ref: reference, amount_cents }),
        }).then((x) => x.json()).catch(() => ({}));
        const ok = r?.matched === true;
        await record(reference, amount_cents, b, {
          matched: ok, kind: "freight",
          request_id: r?.request_id ?? r?.id ?? null,
          note: ok ? null : (r?.reason ?? "freight_no_match"),
        });
        return json({ matched: ok, kind: "freight", ...r });
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        await record(reference, amount_cents, b, { matched: false, kind: "freight", note: msg });
        return json({ matched: false, kind: "freight", error: msg });
      }
    }

    // 1) Try a LoadQ RIDE request first.
    const { data: ride } = await admin.rpc("loadq_ride_match_interac", { p_reference: reference, p_amount_cents: amount_cents });
    if (ride && (ride.matched === true || ride.ok === true || ride.paid === true)) {
      await record(reference, amount_cents, b, {
        matched: true, kind: "ride", request_id: ride.request_id ?? ride.id ?? null,
      });
      return json({ matched: true, kind: "ride", ...ride });
    }

    // 2) A SEAT on a car in the queue. Tried before pickups because a seat reference is
    //    issued at the loading point and paid within minutes — the freshest thing a
    //    deposit is likely to be for. The seat turns green on its own; the list writer
    //    never ticks it, which is the whole point of printing a reference on the QR.
    try {
      const { data: seat } = await admin.rpc("loadq_seat_match_interac",
        { p_reference: reference, p_amount_cents: amount_cents });
      if (seat && seat.matched === true) {
        await record(reference, amount_cents, b, {
          matched: true, kind: "seat", request_id: seat.seat_id ?? seat.id ?? null,
        });
        return json({ matched: true, kind: "seat", ...seat });
      }
      // An amount mismatch is deliberately NOT swallowed: it is reported so a half-paid
      // seat is visible instead of passing as unmatched noise.
      if (seat && seat.reason === "amount_mismatch") {
        await record(reference, amount_cents, b, {
          matched: false, kind: "seat", note: "amount_mismatch",
        });
        return json({ matched: false, kind: "seat", ...seat });
      }
    } catch { /* no seat match */ }

    // 3) Fall back to a PICKUP request (feeder pooled pickup uses the same LQ- refs).
    try {
      const { data: pickup } = await admin.rpc("loadq_pickup_mark_paid", { p_ref: reference });
      if (pickup && pickup.ok === true) {
        await record(reference, amount_cents, b, {
          matched: true, kind: "pickup", request_id: pickup.request_id ?? pickup.id ?? null,
        });
        return json({ matched: true, kind: "pickup", ...pickup });
      }
    } catch { /* no pickup match */ }

    // Nothing claimed it. This is the row that matters most — it is the whole reason the
    // unresolved queue exists, and until now it was never written.
    await record(reference, amount_cents, b, { matched: false, note: "no_match" });
    return json({ matched: false, reference, ride });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await record(reference, amount_cents, b, { matched: false, note: "error: " + msg });
    return json({ error: msg }, 500);
  }
});
