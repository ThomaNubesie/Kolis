# Bug patterns — carry these to every app

Not a changelog. A changelog says what changed; this says **what kind of mistake it was**, so the
same shape can be spotted in ConcordXpress, Kolis, Quorly and whatever comes next.

Each entry: the pattern, what it actually cost here, and how to catch it.

---

## 1. Success is reported at every layer while the thing never happens

The most expensive pattern in this codebase. Five separate instances.

**`pg_cron` says `succeeded` for an HTTP call that failed.** `net.http_post` only *queues* the
request. The job log records that the SQL ran, not that the call was accepted. The Facebook board
post returned `401` every morning and the cron history was green throughout.
→ **Truth lives in `net._http_response`**, not `cron.job_run_details`:
```sql
select status_code, created at time zone 'America/Toronto', left(content,200)
  from net._http_response where created > now() - interval '2 hours' order by created desc;
```

**An unknown action fell through to a valid default.** The noon cron always sent
`action: "post_flyer"`; the function never implemented it. Unknown actions fell through to the
plain text post, which published the *queue summary* instead of the flyer — and returned `200`
with a real post id. A wrong action name is indistinguishable from a working one when the
fall-through is itself a valid operation.
→ **Every dispatcher needs a final `else` that errors.** Never let an unrecognised action land on
a default that does something.

**Our own log recording an id is not evidence the thing is visible.** Added an action that asks
the platform what it actually shows (`published`, `hidden`, `privacy`, `permalink`).
→ For anything published externally, **have a way to read back what the outside world sees.**

**A deploy went "ready" having shipped zero functions.** Netlify reported success; every route
502'd. Function size is the health signal: ~8 MB is a real Next build, 436 KB is a stub.

**Green is not evidence.** Verify the artefact, not the exit code.

---

## 2. The failure path is more durable than the success path

`ImageResponse` stamps og-image routes `immutable, max-age=31536000`. The populated branch
overrode it to two hours; the **empty-state branch returned the response directly** and kept the
default. So the failure case cached for **a year** and the success case for two hours. One
momentary empty read froze a live board permanently — Ottawa showed "no cars" through a morning
with eight in the line.

→ **Audit cache headers on error and empty branches specifically.** A transient failure must never
outlive the condition that caused it. Empty/error states should be `no-store`.

Related: the poisoning read was *my own deploy-verification curl at 1 a.m.*, when the line really
was empty. **Verification can create the bug it is checking for.**

---

## 3. Our problem recorded against the user's record

An unfunded API account made the document reader mark **drivers' documents** as `error`. A clean
licence would have landed in the review queue with a note about our billing.

→ **Classify failures by whose problem they are.** Infrastructure failures (401/403/429/5xx,
billing, quota) must abort the batch and leave records untouched — not annotate them. Only
failures *about the record* may be written to the record.

---

## 4. A state that belongs to no queue

Documents marked `error` were excluded from the machine queue (`machine_status is null`) *and*
the human queue (`in ('pass','uncertain')`). Stranded, pending, invisible to both, forever.

→ After adding a status value, **enumerate every query that filters on that column** and confirm
the new value lands somewhere. A status with no reader is a leak.

---

## 5. A state that belongs to no screen

Unpaid pickup quotes appeared on no operator view at all — the rider saw their own, a driver saw
runs, and runs only exist after payment. A real customer with a real phone number was invisible
until he phoned.

→ **Every state a record can occupy needs somewhere a human can see it.** Especially the states
where money is owed.

---

## 6. Trusting a client-supplied identifier

`passenger_id: b.passenger_id || null` — straight from the request body, stored unvalidated, with
**no foreign key** to object. A deleted account left a live $20.22 booking pointing at an id that
existed nowhere.

→ **Foreign keys on every id column, always.** `ON DELETE SET NULL` for transaction records —
deleting a person must never delete the record of a transaction they were part of.
→ Derive identity **server-side from the caller's token**, never from the body.

---

## 7. A delete routine that predates half the tables

`delete_my_account` cleared trips, messages, vehicles, driver and passenger rows — and had never
been updated for `loadq_pickup_requests`. The booking survived its own customer.

→ **When you add a table holding user data, open the delete routine the same day.** Keep a list
of tables that reference a user; make deletion cover it or explicitly decide it shouldn't.

---

## 8. A trusted-caller bypass placed above *all* checks instead of the soft ones

`queue_entries_require_eligible` let admins, list writers and anything without a JWT through
**before it looked at the driver**. The bypass existed so a list writer could queue an *unverified*
driver — but it sat above every check, so it carried `blocked` with it. A driver blocked for
threatening someone could still be put in a line.

→ **Order checks by whether they may be bypassed.** Absolute conditions (blocked, banned, legally
barred) go first and apply to everyone. Administrative conditions come after the bypass.

---

## 9. Silent-nothing query constructs

**PostgREST embeds.** `drivers!inner(full_name, phone)` returned zero rows with no error. Every
document send-back would have failed with `no_phone` — the driver would never learn their document
was refused. Silence is the worst failure mode: rejection that never arrives looks like nothing
happening.
→ Two plain queries beat one clever embed. If an embed returns empty, **check it returns anything
at all** before trusting it.

**Codes from the wrong taxonomy.** NAICS codes truncated to four digits and typed into a form
wanting Québec **CAE** codes. `4921` = *Distribution de gaz*. It would have registered a transport
company as a gas utility, silently, because the field accepts any 4 digits.
→ **Never truncate an identifier from one system to fit another's field width.** Use the target
system's own lookup.

---

## 10. Derived label reads the wrong field

The pickup reminder built its itinerary from `destination_region` — the *onward* region — instead
of the actual leg (`pickup_address` → `drop_zone_id`). A rider collected in Gatineau and dropped in
Ottawa was told his trip was "vers Montreal": a journey nobody was selling him, hiding the one he
was being asked to pay for.

→ When a record holds several locations, **name the field for the leg it describes**, and check
which one a user-facing string actually reads.

---

## 11. Renaming parents without renumbering children

Removing Article 8 and renumbering the headings 9–15 → 8–14 left every **sub-clause** carrying its
old parent number: Article 8 contained clauses `9.1, 9.2, 9.3`. Cross-references were updated;
sub-numbering wasn't.

→ After any renumbering, **enumerate every derived identifier** — sub-clauses, cross-references,
anchors, file names — not just the headings.

---

## 12. A bounding box that swallows its neighbour

Detecting the extent of `COVOITURAGE` in a flyer caught the **accent of MONTRÉAL below it** as part
of the same word. Repainting destroyed the accent, and the replacement text sat 49 px too low.
One wrong boundary produced two visible defects.

→ When deriving a region from content, **verify the region's edges against what's adjacent**.

---

## 13. Text search cannot read pictures

Reported "carpool eradicated" after sweeping code, database and cron. The word survived in **PNG
artwork** — including a flyer scheduled to publish that afternoon reading `COVOITURAGE INTERURBAIN`.

→ A terminology sweep must cover **images, PDFs, app-store copy, social profiles, email
letterheads and anything rendered rather than stored as text.** Grep proves nothing about them.

---

## 14. Configuration silently reset by a redeploy

`supabase functions deploy` **defaults `verify_jwt` to true** and does not read the function's
current setting. Redeploying anything originally shipped with `--no-verify-jwt` silently turns JWT
verification back on. Broke the Facebook poster; would have killed the letter to the City.

→ **Always pass `--no-verify-jwt` for cron-called functions, every time, even for a comment change.**
→ Better: have the cron send an `Authorization` header anyway, so it survives a forgetful redeploy.
→ After redeploying anything cron-driven, **call it exactly as the cron does** and check it answers.

---

## 15. A flag computed from a standard nobody meets

`loadq_driver_docs_complete()` required all seven by-law documents. Four of the seven had **zero**
approvals fleet-wide. Any recompute of `drivers.verified` would have flipped **127 of 127** drivers
to unverified — and `loadq_doc_certify` recomputed on every certification. Approving one licence
would have taken that driver off the road.

→ When tightening a requirement, **measure the population against it before wiring it to a gate.**
→ Phase it: `verified := verified OR complete` during grace, `verified := complete` after. Promote
only, until the deadline.

---

## 16. Environment traps that look like other problems

- **`auth.uid()` is NULL under the service role.** RPCs gated on an admin check return `forbidden`
  when called from an edge function. Use a `..._is_admin_or_service()` helper.
- **"Credit balance too low" while `/v1/models` returns 200** — the key is fine; the money went to
  a different *product* (Claude subscription top-up ≠ API credits).
- **Images over 8000 px are refused by the API.** Phone cameras clear that routinely. Resize on the
  way out — cheaper in tokens too.
- **Icons that type-check but don't exist at runtime.** `FileSignature`, `Fingerprint` aren't in the
  installed lucide. Check `node_modules/.../icons/` before importing.
- **Netlify CLI resolves `publish` from the working directory**, not `base` in netlify.toml. Run it
  from the app directory or it ships a stub.
- **Non-ASCII drift.** A Cyrillic word once slipped into a SQL comment. Scan before committing:
  `LC_ALL=C grep -n '[^\x00-\x7F]' file`

---

## 17. Layout faults that hide content

- **No `box-sizing: border-box`** — a fixed-height element plus padding pushed the footer 88 px
  below the clip. Content was there; nothing showed it.
- **Override placed before the rule it must beat** — a render harness prepended `body{margin:0}`
  ahead of the page's own `body{padding:...}`, so the page won and the capture was cropped.
- **Emoji colour cannot be controlled.** 🍁 is orange in every emoji font — invisible on a red pill.
  Draw flags and marks in CSS or SVG when colour matters.
- **Brand colour derived from the wrong background.** `Wordmark` computed ink from `Colors.bg`
  while the screen painted its own dark surface, so "Load" would have rendered dark-on-black. Let
  components take the background they're actually on.

---

## 18. Working practice that caught most of this

- **Rolled-back `DO` blocks** to test destructive behaviour against production data:
  do the thing, `raise exception` with the result, everything reverts.
- **Prove the negative.** After adding a guard, attempt the forbidden action and confirm refusal.
- **Read back what shipped** — render the PNG and look at it, fetch the URL and check the bytes,
  ask the platform what it displays.
- **Measure before enforcing.** Count the affected population before wiring a rule to a gate.
- **Deploy draft-first**, verify framework and artefact size, then promote.

---

## 19. Cancelling the timer is not cancelling the request

The address autocomplete debounced with `setTimeout` and cleared it in the effect cleanup. But
once the debounce had fired and the handler was `await`ing Google, **cleanup could no longer stop
it**. Tapping a suggestion cleared the list, then the in-flight response returned and reopened it —
showing the address the rider had just chosen, sitting under the now-filled field.

→ **Give every async lookup a ticket and discard stale replies.** `const mine = ++seq.current` before
the call, `if (mine !== seq.current) return` after it. Clearing a timer only helps before it fires.

Second fault in the same function: a `skip` flag set before `onChangeText`, to suppress the search
that the change would trigger. When the resolved address happened to equal the text already there,
the value didn't change, the effect never ran, the flag was never consumed — and it silently
swallowed the rider's next keystroke.

→ **A flag consumed by a side effect must only be set when that side effect will certainly happen.**
Guard it: `if (next !== current) skip.current = true`.

---

## 20. The same fix applied to one sibling and not the other

`PassengerBottomNav` already added `insets.bottom` to its padding. `BottomNav` — the driver's — did
not, so the phone's system navigation bar sat over it. One component was fixed when the bug was
found; its twin was never opened.

→ **When fixing a component, grep for its siblings.** Anything matching `*BottomNav*`, `*Header*`,
`*Card*` is a candidate for the identical defect.

---

## 21. Two doors into the same room

The passenger board had "Request a ride" as a prominent button and "Can't reach a loading point?"
as a grey link. Both ran `router.push("/(passenger)/pickup-options")`. Riders reasonably read two
different weights and two different labels as two different services.

→ **One entry point per destination.** If two controls navigate to the same screen, either merge
them or make each go somewhere that matches its label.

---

## 22. Asking for what you already have

Door-to-door booking asked eight questions before quoting. Three weren't new information:
**destination city** (already inside the drop-off address, which the autocomplete resolves with a
postal code), **preferred time** (asked immediately after a time block — the same question twice),
and **seat count** (meaningless for a whole-car booking).

→ **Before adding a field, check whether an answer already on the screen contains it.** Derive and
confirm — "✓ Destination: Montréal — taken from the address" — instead of asking again. Two fields
asking the same thing will eventually disagree, and then neither can be trusted.
