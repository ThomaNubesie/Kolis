// loadq-doc-verify — reads each uploaded document and prepares the decision.
//
// Seven documents per driver is too much to review by hand, and most of the work is
// mechanical: is this the right kind of document, is it legible, whose name is on it, when
// does it expire, does the plate match the car on file.
//
// The split is deliberate and asymmetric:
//   · this may REJECT — a blurred photo or an expired licence is not a judgement call, and it
//     costs the driver a retake and nothing else;
//   · this may never APPROVE. It extracts, cross-checks and flags; a person certifies.
//
// Anything it is unsure about becomes 'uncertain' and goes to a human rather than guessing.
// The asymmetry is the whole design: a false rejection wastes a minute, a false approval puts
// an unchecked driver in a car with passengers.
//
// POST {}            → sweep pending documents (what the cron calls)
// POST { doc_id }    → one document
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-opus-5";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

// What the model must return. Forcing a tool call means no prose to parse and no ambiguity
// about a missing field — absent is null, not a sentence apologising for not finding it.
const SCHEMA = {
  name: "document_reading",
  description: "What can be read off the uploaded document, and nothing inferred.",
  input_schema: {
    type: "object",
    properties: {
      legible: { type: "boolean", description: "Is the whole document readable? false for blur, glare, cropped edges, or a photo of a screen." },
      document_kind: { type: "string", description: "What this document actually IS, in your own words (e.g. 'Ontario driver's licence', 'insurance pink slip', 'police record check', 'safety standards certificate', 'unrelated photo')." },
      matches_expected: { type: "boolean", description: "Is it the kind of document that was asked for?" },
      full_name: { type: ["string", "null"], description: "Name printed on the document, exactly as written." },
      expiry_date: { type: ["string", "null"], description: "Expiry or valid-until date as YYYY-MM-DD. Null if the document shows none." },
      issue_date: { type: ["string", "null"], description: "Issue date as YYYY-MM-DD, if shown." },
      document_number: { type: ["string", "null"], description: "Licence/policy/certificate number if shown." },
      issuing_authority: { type: ["string", "null"], description: "Who issued it (e.g. 'Ontario Ministry of Transportation', 'Ottawa Police Service')." },
      plate: { type: ["string", "null"], description: "Licence plate shown, if any." },
      concerns: { type: "array", items: { type: "string" },
        description: "Anything that would worry a reviewer: signs of alteration, mismatched fonts, a screenshot rather than a document, obscured fields, handwriting over printed text." },
      confident: { type: "boolean", description: "Are you confident in this reading? false if you are guessing at any field above." },
    },
    required: ["legible", "document_kind", "matches_expected", "concerns", "confident"],
  },
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ")
    .split(/\s+/).filter(Boolean);

// Names on documents carry middle names, initials, and a different order. Requiring an exact
// match would reject half the drivers on the sheet, so this asks a softer question: do the
// two names share enough parts to be the same person?
function nameAgrees(onDoc: string | null, onFile: string | null): boolean | null {
  const a = norm(onDoc), b = norm(onFile);
  if (!a.length || !b.length) return null;
  const shared = a.filter((w) => w.length > 2 && b.includes(w));
  return shared.length >= Math.min(2, Math.min(a.length, b.length));
}

// An unfunded account, a revoked key or a rate limit is OUR problem, not the driver's.
// Marking their document 'error' for it would put a clean licence in the human queue with a
// note about billing on it. Stop the sweep instead and leave the documents untouched — they
// are still pending, and the next run picks them up unchanged.
function isOurProblem(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status >= 500) return true;
  return /credit balance|billing|quota|overloaded/i.test(body);
}


// A health probe, because "credit balance too low" can mean the key is fine and the money went
// to a different organisation. GET /v1/models needs no credit: if it answers 200 the key is
// live and the balance really is the problem; if it 401s the key itself is wrong or revoked.
// Reports no part of the key beyond the public prefix everyone's key shares.
async function probe(key: string) {
  const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  const body = (await r.text().catch(() => "")).slice(0, 300);
  return {
    key_present: true,
    key_prefix: key.slice(0, 12),
    key_length: key.length,
    models_endpoint: r.status,
    verdict: r.ok
      ? "key is valid and live — the credit went to a DIFFERENT org/account than this key belongs to"
      : r.status === 401
        ? "key is rejected — wrong, rotated or revoked key in ANTHROPIC_API_KEY"
        : "unexpected — see body",
    body,
  };
}

// One place that turns a stored document into something the API will accept.
//
// A driver photographs a licence with a modern phone and the file comes back 9000 px wide;
// the API refuses anything over 8000. Supabase resizes on the way out, so the fix costs no
// library and no CPU here — and a 1568 px image is also the largest Claude uses, so every
// read gets cheaper as a side effect. Falls back to the original if transforms are
// unavailable, because a large image that might work beats no image at all.
async function loadImage(db: any, path: string):
  Promise<{ b64: string; media: string } | { why: string }> {
  const sign = async (transform?: unknown) => {
    const { data } = await db.storage.from("driver-docs")
      .createSignedUrl(path, 600, transform ? { transform } : undefined);
    return data?.signedUrl ?? null;
  };
  let url = await sign({ width: 1568, height: 1568, resize: "contain" });
  let res = url ? await fetch(url) : null;
  if (!res?.ok) {
    url = await sign();
    res = url ? await fetch(url) : null;
  }
  if (!res?.ok) return { why: res ? `fetch_${res.status}` : "no_file" };
  const media = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(media)) return { why: media };
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = ""; for (const x of bytes) bin += String.fromCharCode(x);
  return { b64: btoa(bin), media };
}

Deno.serve(async (req) => {
  if (!ANTHROPIC) return json({ ok: false, error: "anthropic_not_configured" }, 500);
  const db = createClient(URL_, SRK, { auth: { persistSession: false } });

  try {
    const b = await req.json().catch(() => ({} as any));
    if (b.probe) return json({ ok: true, probe: await probe(ANTHROPIC) });
    // {"names":true} — read approved licences we have never read, and write ONLY what was
    // read. No status is touched: these documents are already certified by a person, and the
    // point of the pass is to learn the name printed on the card so the account can be matched
    // to it. Skips anything already read, so it is safe to run repeatedly.
    if (b.names) {
      // Two plain queries rather than an embed: the PostgREST join returned nothing and this
      // is not the place to find out why.
      const { data: docs, error: dErr } = await db.from("loadq_driver_documents")
        .select("id, storage_path, driver_id")
        .eq("doc_type", "drivers_license").eq("status", "approved")
        .is("extracted", null).not("storage_path", "is", null).limit(b.limit ?? 25);
      if (dErr) return json({ ok: false, error: dErr.message }, 500);
      const ids = [...new Set((docs ?? []).map((d: any) => d.driver_id))];
      const { data: people } = await db.from("drivers").select("id, full_name").in("id", ids);
      const nameOf = new Map((people ?? []).map((p: any) => [p.id, p.full_name]));
      const read: any[] = [];
      for (const d of (docs ?? []) as any[]) {
        const account = nameOf.get(d.driver_id) ?? null;
        try {
          const im = await loadImage(db, d.storage_path);
          if ("why" in im) { read.push({ doc_id: d.id, account, why: im.why }); continue; }
          const { b64: bin64, media } = im;
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": ANTHROPIC!,
                       "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: MODEL, max_tokens: 1200, tools: [SCHEMA],
              tool_choice: { type: "tool", name: "document_reading" },
              messages: [{ role: "user", content: [
                { type: "image", source: { type: "base64", media_type: media, data: bin64 } },
                { type: "text", text:
`This is a driver's licence already on file. Read ONLY what is printed on it — the full name
exactly as written, the expiry, and the licence number. Do not infer or correct anything; a
field you cannot see is null.` }] }],
            }),
          });
          if (!res.ok) {
            const detail = (await res.text().catch(() => "")).slice(0, 300);
            if (isOurProblem(res.status, detail))
              return json({ ok: false, error: "reader_unavailable", http: res.status, detail,
                            read }, 503);
            read.push({ doc_id: d.id, account, why: `api_${res.status}`, detail }); continue;
          }
          const body = await res.json();
          const use = (body.content ?? []).find((c: any) => c.type === "tool_use");
          if (!use) { read.push({ doc_id: d.id, account, why: "no_reading" }); continue; }
          const f = use.input as any;
          const agrees = nameAgrees(f.full_name, account);
          await db.from("loadq_driver_documents").update({
            extracted: { ...f, name_agrees: agrees, read_only_pass: true,
                         checked_at: new Date().toISOString() },
            machine_at: new Date().toISOString(),
          }).eq("id", d.id);
          read.push({ doc_id: d.id, account, licence_name: f.full_name ?? null,
                      expiry: f.expiry_date ?? null, agrees });
        } catch (e) {
          read.push({ doc_id: d.id, account, why: String((e as Error)?.message ?? e) });
        }
      }
      return json({ ok: true, mode: "names", read: read.length, documents: read });
    }

    const { data: q, error } = await db.rpc("loadq_docs_for_machine", { p_limit: b.doc_id ? 50 : 10 });
    if (error) return json({ ok: false, error: error.message }, 500);
    let rows = (q?.rows ?? []) as any[];
    if (b.doc_id) rows = rows.filter((r) => r.doc_id === b.doc_id);

    const out: any[] = [];
    for (const r of rows) {
      const rec: any = { doc_id: r.doc_id, doc_type: r.doc_type, driver: r.driver_name };
      try {
        // Short-lived signed URL, resized on the way out: the image goes to the model and
        // nowhere else.
        const im = await loadImage(db, r.storage_path);
        if ("why" in im) {
          if (im.why === "no_file" || im.why.startsWith("fetch_")) {
            rec.action = im.why; out.push(rec); continue;
          }
          // A PDF is a perfectly good document; it just is not something to read this way.
          await db.rpc("loadq_doc_machine_review", { p_doc: r.doc_id, p_status: "uncertain",
            p_notes: `Not an image (${im.why}) — needs a person to open it.` });
          rec.action = "uncertain"; rec.why = im.why; out.push(rec); continue;
        }
        const { b64, media } = im;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": ANTHROPIC,
                     "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1200,
            tools: [SCHEMA],
            tool_choice: { type: "tool", name: "document_reading" },
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: media, data: b64 } },
                { type: "text", text:
`This was uploaded by a driver for a City of Ottawa Private Transportation Company licence.

Expected document: ${r.expect ?? r.doc_type}
${r.expect_help ? "Requirement: " + r.expect_help : ""}

Read ONLY what is printed on it. Do not infer, complete or correct anything — if a field is
not visible, return null rather than a plausible value. If the image is a photo of a screen,
is cropped, blurred, or has glare over any field, say it is not legible.

This reading decides whether a person is allowed to carry passengers, so err towards
confident=false when you are unsure.` },
              ],
            }],
          }),
        });
        if (!res.ok) {
          const detail = (await res.text().catch(() => "")).slice(0, 400);
          if (isOurProblem(res.status, detail)) {
            // Abandon the whole sweep. Every document keeps its pending status untouched.
            return json({ ok: false, error: "reader_unavailable", http: res.status,
              detail, reviewed: out.length,
              note: "Documents left untouched — they stay pending and will be read on the next run.",
              documents: out }, 503);
          }
          rec.action = "api_error"; rec.why = `${res.status} ${detail}`;
          await db.rpc("loadq_doc_machine_review", { p_doc: r.doc_id, p_status: "error",
            p_notes: `Automated read failed (${res.status}) — queued for a person.` });
          out.push(rec); continue;
        }
        const body = await res.json();
        const use = (body.content ?? []).find((c: any) => c.type === "tool_use");
        if (!use) {
          await db.rpc("loadq_doc_machine_review", { p_doc: r.doc_id, p_status: "uncertain",
            p_notes: "No structured reading returned — queued for a person." });
          rec.action = "uncertain"; out.push(rec); continue;
        }
        const f = use.input as any;

        // ── cross-checks against what we already hold ─────────────────────────────────
        const today = new Date().toISOString().slice(0, 10);
        const nameOk = nameAgrees(f.full_name, r.driver_name);
        const plateOk = f.plate && r.plate
          ? f.plate.replace(/\W/g, "").toUpperCase() === String(r.plate).replace(/\W/g, "").toUpperCase()
          : null;
        const expired = f.expiry_date ? f.expiry_date < today : null;

        const hard: string[] = [];   // send it back — the driver can fix these
        const soft: string[] = [];   // a person should look

        if (f.legible === false) hard.push("the photo is not readable — please retake it in good light, with the whole document in frame");
        if (f.matches_expected === false) hard.push(`this looks like ${f.document_kind}, not the document requested`);
        if (expired === true) hard.push(`this document expired on ${f.expiry_date}`);
        if (!f.expiry_date && f.legible !== false) hard.push("no expiry date is visible on the document");
        if (nameOk === false) soft.push(`name on document (${f.full_name}) does not match the account (${r.driver_name})`);
        if (plateOk === false) soft.push(`plate on document (${f.plate}) does not match the vehicle on file (${r.plate})`);
        if (f.confident === false) soft.push("the automated reading was not confident");
        if ((f.concerns ?? []).length) soft.push(...f.concerns);

        const status = hard.length ? "reject" : soft.length ? "uncertain" : "pass";
        const notes = hard.length ? hard.join(" · ")
                    : soft.length ? soft.join(" · ")
                    : `Read cleanly: ${f.document_kind}${f.issuing_authority ? ", " + f.issuing_authority : ""}.`;

        await db.rpc("loadq_doc_machine_review", {
          p_doc: r.doc_id, p_status: status,
          p_extracted: { ...f, name_agrees: nameOk, plate_agrees: plateOk, checked_at: new Date().toISOString() },
          p_notes: notes,
          p_expiry: f.expiry_date ?? null,
        });
        rec.action = status; rec.notes = notes; rec.expiry = f.expiry_date ?? null;
      } catch (e) {
        rec.action = "error"; rec.why = String((e as Error)?.message ?? e);
        await db.rpc("loadq_doc_machine_review", { p_doc: r.doc_id, p_status: "error",
          p_notes: "Automated read failed — queued for a person." }).catch(() => {});
      }
      out.push(rec);
    }

    const tally: Record<string, number> = {};
    for (const r of out) tally[r.action ?? "?"] = (tally[r.action ?? "?"] ?? 0) + 1;
    return json({ ok: true, reviewed: out.length, tally, documents: out });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
