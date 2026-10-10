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

---

## 23. The keyboard covers the button that dismisses the keyboard

A bottom sheet with one text field looks finished on the simulator you built it on, because the
simulator is tall and the keyboard is short. Four independent defects hide in the same twenty
lines, and each one alone is enough to make the sheet unusable:

- **`behavior={Platform.OS === "ios" ? "padding" : undefined}`** — correct for a full-screen
  ScrollView, wrong for a sheet. On Android `undefined` lifts nothing at all. Sheets need
  `"height"` there.
- **A `keyboardVerticalOffset` copied from a sibling screen.** Non-modal screens want
  `insets.top`; inside a `<Modal>` the view already starts at the screen top, so the same value
  pushes the content up by the height of the status bar for no reason. Modals want `0`.
- **A `ScrollView` whose parent has no `maxHeight`.** An unbounded ScrollView measures to its
  content, so it is a ScrollView that cannot scroll — it looks right in review and the submit
  button is still off-screen. The scroll only becomes real with `maxHeight: "82%"` on the sheet.
- **A sheet nested inside a full-screen `Pressable` dim.** With the keyboard up, the first tap
  anywhere is consumed dismissing it, so the submit button appears dead — the user taps it twice
  and reports that the button does nothing. `keyboardShouldPersistTaps="handled"` is what lets
  that first tap through.

→ **Test every text field on the shortest screen you support, with the keyboard open, on both
platforms.** The question is never "is there a KeyboardAvoidingView" — it is "can I reach the
submit button and does one tap press it". A `KeyboardAvoidingView` that is present and misconfigured
reads as handled in every code review.

---

## 24. One publish, one runtime, and a success message either way

LoadQ's `app.json` sets `runtimeVersion: { policy: "appVersion" }`. An OTA update is therefore only
offered to installs whose app version matches the version in `app.json` at publish time. Drivers are
never all on one build — some updated from the store, some did not — so a single
`eas update --branch production` reaches **one** of those populations and silently skips the other.

What makes it a trap rather than a nuisance: **the publish that reaches nobody looks exactly like the
publish that reaches everybody.** `✔ Published!` prints, an update group ID is minted, the dashboard
shows a healthy entry. Nothing anywhere says "0 devices match this runtime". The only tell is the
`Runtime version` line in the output, and you have to already know what to compare it against.

The history of the channel is the evidence: every release worth shipping appears **twice** in
`eas update:list`, once per live runtime. A release that appears once was half-shipped.

→ **Publish once per live runtime, and read the runtime line, not the checkmark.**
```
eas update:list --branch production --limit 8   # which runtimes are actually being served
eas build:list --limit 6                        # which app versions exist as builds
```
Then publish at the current version, temporarily set `app.json`'s `version` to the older live one,
publish again, and revert. Confirm the revert with `git status` — a version bump left behind silently
mislabels the next build.

→ **The general shape:** when a delivery mechanism targets a cohort, "success" means "accepted for
the cohort I named", never "reached the users I meant". The same reasoning as #1 — ask what the
success message is actually a statement about, and find the thing that counts recipients.

## 25. The permission check that returned neither yes nor no

Balenton's money guard read:

```sql
create function bal_handles_money(p_shop uuid) returns boolean as $$
  select bal_role_in(p_shop) in ('owner','manager');
$$;
```

`bal_role_in` returns the caller's role at that shop, or **NULL** if they are not a member. And
`NULL in ('owner','manager')` is **NULL**, not false. So for a complete stranger the function
returned NULL.

Every guard written the obvious way was then wide open:

```sql
if not public.bal_handles_money(v_wo.shop_id) then
  raise exception 'not permitted';
end if;
```

`not NULL` → NULL, and plpgsql runs the `then` branch only when the condition is **true**. NULL is
not true, so the raise never fired and the stranger issued the invoice.

What made it nearly invisible: **the people you test with all have roles.** A mechanic returns
'mechanic', which compares cleanly to false, so "a mechanic cannot bill" passed and looked like
proof the guard worked. Only somebody with *no row at all* reaches the NULL. The suite had eleven
passing authorisation tests and not one of them used a non-member.

It also hid behind RLS. The same function in a policy was always safe, because a `USING` clause
that evaluates to NULL **denies**. SQL's three-valued logic fails closed in a policy and fails
**open** in an `IF`. So the declarative half of the security model was correct while the
imperative half was not, from one shared helper.

→ **A predicate used for authorisation must return true or false, never NULL.** Fix it at the
source — `coalesce(..., false)` inside the function — not at each call site, so the next guard
written against it is safe without anyone having to remember.

→ **Test the absent case, not just the wrong-role case.** For every "X cannot do Y", add
"somebody with no relationship to the row at all cannot do Y". That is the one that finds the NULL.

→ **The general shape:** any three-valued expression crossing into a two-valued decision needs an
explicit default. `IN`, `=`, `<>`, `LIKE` against a nullable column, and `ANY`/`ALL` over a set that
may contain NULL all return NULL rather than false. If a NULL would mean "allow", that is a
vulnerability; if it would mean "crash", that is a bug. Decide which, in writing, at the boundary.

## 26. The view that quietly turned RLS off

Balenton's tables are protected by row-level security, every policy tested, 350-odd assertions
covering cross-tenant reads. Then a convenience view was added over the top:

```sql
create view public.shop_activity as
  select ... from work_orders
  union all select ... from invoices
  union all select ... from invoice_payments;
```

A mechanic reading it got the invoices they are refused on the table. A customer got the shop's
history. **Another shop's owner got 89 rows of a shop they have nothing to do with.**

A Postgres view runs with the privileges of the view's **owner**, not the caller. The owner here is
the migration role, which owns the tables, so RLS on every table underneath is simply not applied.
The policies were all correct. The view went around them.

```sql
alter view public.shop_activity set (security_invoker = on);
```

With `security_invoker`, the view runs as the querying user and RLS applies exactly as it does to a
direct select. It is Postgres 15+, and it is **off by default**, which is the trap: the safe
behaviour is the one you have to ask for.

→ **Every view over an RLS-protected table needs `security_invoker = on`.** Not "most". A view is
the easiest way in the system to hand someone data a policy refuses them, and nothing warns you.

→ **Test the view the same way you test the table.** The table had a dozen cross-tenant tests; the
view had none, because it felt like a formatting convenience rather than an access path. It is an
access path.

→ **But do not sweep.** The first fix was a loop over every view in the schema, which also caught
`member_service_history` — a view that is *deliberately* definer, because its job is to show a car
owner that a locked service record exists so the paywall makes sense. It can only do that by
reading rows RLS hides. The loop silently emptied a feature it knew nothing about, and two
unrelated tests went red. Name the views that should be invoker; a definer view is a decision, and
decisions should be visible.

→ **The general shape:** anything that reads on your behalf — a view, a `security definer`
function, an edge function holding a service-role key, a cached materialisation — inherits ITS
privileges, not the caller's. Every one of those is a place where a correct policy underneath
stops being enforced. When adding one, the question is not "is this query right" but "whose
permissions does this run with".

---

## #27 — RLS policies are ORed, so a new permissive policy can silently repeal an old restriction

**Where:** Balenton, migration `0027_approval_opens_the_job.sql` (caught by the suite before it shipped).

A client authorises an estimate and the system opens the work order for them. Worried the brand-new
job would be invisible to the person who just paid for it, I added what looked like the obvious
policy:

```sql
create policy wo_own_client on public.work_orders
  for select to authenticated
  using (exists (select 1 from public.clients c
                  where c.id = work_orders.client_id and c.user_id = auth.uid()));
```

One test went red: *"being the shop's own client does not bypass the paywall: expected 0, got 1"*.

There was already a policy for this, and the difference was the whole feature:

```sql
using (locked_at is null and exists (... c.user_id = auth.uid()))
```

While a job is open its owner watches it; once it is locked it becomes portable service history,
which the product **sells**. My policy was the same condition minus the restriction, and because
multiple permissive policies are combined with **OR**, adding it did not narrow anything — it
repealed the `locked_at is null` half for every archived record, handing the paywalled inventory
free to exactly the people it is aimed at.

→ **A new permissive policy can only widen access, never narrow it.** `USING` clauses on
`PERMISSIVE` policies are ORed. If you want to narrow, you edit the existing policy or add a
`RESTRICTIVE` one — a second permissive policy is strictly a grant.

→ **Before writing a policy, read the policies already on that table.** Mine was a near-duplicate
of one whose extra conjunct *was* a business rule. If the policy you are about to write is an
existing one with a condition missing, you are not adding access — you are deleting that condition.

→ **The suspicious shape is a policy that restates an existing one more simply.** Simpler is not
better here; the complexity in a policy is usually load-bearing.

→ **The fix was to write nothing.** The existing policy already covered the case I was worried
about: a freshly opened work order has `locked_at is null`, so it was visible all along. The
migration now carries a comment saying what was *not* added and why, because the next person will
have the same worry.

---

## #28 — `\d` in a JavaScript template literal is just `d`

**Where:** Balenton, `supabase/tests/security.test.mjs`, a regex assertion generated by a script.

```js
`select (number ~ '^BT-\d{4}-\d{3}$') from public.work_orders where id = '${id}'`
```

Asserted true, got false. The SQL that reached Postgres was `^BT-d{4}-d{3}$` — a template literal
processes escape sequences, and `\d` is not one, so it collapses to the bare letter. The regex
still *compiles*, still matches something, and simply never matches what you meant. The tests
written by hand next to it had `\\d` and were right.

→ **Any backslash class inside a template literal or a normal JS string needs doubling** when the
string is a regex for somewhere else (SQL, a shell, a config). `\d \w \s \b \. \+` all degrade
quietly rather than erroring.

→ **A regex assertion that fails is more trustworthy than one that passes.** Mine failed loudly
only because the data did not match the mangled pattern; `^BT-d*` against free text could easily
have passed and asserted nothing for years. When a test checks a *format*, also check that the
pattern rejects something.

→ **Generating code with a script makes this likelier.** Python's `r"""..."""` preserved `\d`
faithfully into a JS context where it does not survive. Each layer needs its own escaping, and
"the source file looks right" is not the test — read the string the *last* layer receives.

---

## #29 — Adding a state to a lifecycle breaks every guard that named the old one

**Where:** Balenton, `0028_estimate_drafts.sql`. One new status, three separate breakages.

An estimate had `pending → accepted → invoiced`. The bay tablet needed to write one line by line, so
`draft` went in front. The column change was one line; what it broke was everywhere that had spelled
the old state out:

| Guard | Wrote | Effect of a `draft` |
|---|---|---|
| `bal_estimate_lines_locked` | `if status is distinct from 'pending' then raise` | the editor could not add a line to its own draft |
| `bal_estimate_immutable` | `if old.status = 'pending' then return new` | re-totalling raised *"has been accepted and is the agreed ceiling"* |
| `estimates_client` RLS | client sees any estimate of theirs | unfinished $0.00 quote visible on the customer's phone |
| `estl_client` RLS | client sees the lines of their estimates | and the money on it, even with the header hidden |

Only the first two failed loudly. The RLS ones were silent and were the dangerous pair — and because
acceptance now opens a work order, a customer tapping that empty quote would have opened a job with
no work on it.

→ **Before adding a state, grep the codebase for the literal name of the states you have.** Every
`= 'pending'`, `<> 'pending'`, `in ('accepted','invoiced')` is a place that silently decided what
your new state means. `is distinct from 'x'` and `= 'x'` fail in *opposite* directions — one
over-restricts, one over-permits — so you cannot guess which guards matter by reading the diff.

→ **Phrase guards as the set that is allowed, not the one state you had in mind.**
`in ('draft','pending')` survives a new terminal state; `<> 'accepted'` does not.

→ **Two places need the new state and two places must refuse it.** Writing the permissive half and
forgetting the restrictive half is the normal failure, because the permissive half is what you were
trying to do and the restrictive half is what somebody else relied on.

→ **A default is a decision.** `status` defaulted to `'pending'` — correct when the only constructor
built a complete document in one statement, wrong the moment a constructor made an empty one. When
adding a constructor, check whether the column defaults still describe what it produces.

---

## #30 — A scripted edit that replaces a RANGE silently deletes whatever else was in it

**Where:** Balenton, twice in one session, by the same mechanism.

Edits applied with a Python helper that slices between two markers:

```python
start = s.index("// ── the client's file, from the bay ──")
end   = s.index("// ── profile ──")
s = s[:start] + new_block + s[end:]
```

Between those two markers were `saveClient` and `loadMechMakes`. Both vanished. `check.mjs`
reported **"12 modules parse"** — because a file calling a function that no longer exists is
perfectly valid JavaScript. It fails when a hand touches the button.

The same thing happened again in SQL an hour later: a guard wrapping a `storage` block was inserted
by replacing the range from `insert into storage.buckets` to the next heading, and that range
contained the `bal_owns_logo_folder` definition the policies below referenced. That one at least
failed loudly — `function public.bal_owns_logo_folder(text) does not exist` — but only at deploy
time, against the live database.

→ **Replacing a range deletes everything in it, including what you did not read.** `s.index(a)` to
`s.index(b)` is not "replace this function", it is "replace these 300 lines". Before writing a
range replacement, print the range and read it.

→ **Prefer replacing an exact old string over slicing between markers.** `assert old in s;
s.replace(old, new, 1)` can only change what you actually quoted. Range-slicing is only safe when
the range is short enough to have been read in full.

→ **Parse checks do not catch deletions.** A missing function, a missing DOM id, a missing SQL
object are all syntactically fine. After any scripted edit, diff the definitions before and after:

```sh
git diff -U0 | grep -E '^-\s*(async )?function |^-create (or replace )?function'
```

→ **Grep for callers of anything the edit removed.** The cheap version of a test: collect every
`name(` in the file, subtract every definition, and report the difference. That audit found the
missing ids and would have found the missing functions instantly.

## 27. The sanity constraint that made the row impossible to close

`work_order_time_entries` had a reasonable guard — `check (ended_at is null or ended_at <
started_at + interval '16 hours')` — because nobody worked nineteen hours on one brake job. Every
function that closed a clock then wrote `ended_at = now()`.

For a clock opened the previous evening, `now()` is nineteen hours after `started_at`, so the
constraint refused the write. Four separate paths were dead, and the worst one was not the obvious
one:

- the mechanic's own **stop** button → a raw `23514` with no way around it, forever;
- **starting the next car** → it implicitly closes the previous clock first, so one forgotten tap
  yesterday locked the tablet out of job time on *every* car;
- **going home** → attendance could not be recorded either, because clocking out closes job
  clocks in the same transaction;
- the **cleanup function written specifically to fix this** → it closed clocks with `now()` too.

All four were written at different times by the same reasoning, and all four were wrong the same
way. Nothing in review catches this: the constraint reads as correct, and so does `ended_at =
now()`. It only appears when a row is old enough, which in a test suite is never.

→ **A duration constraint is a constraint on every writer, not just the inserter.** If a table
refuses spans over N, then no writer may set the end to `now()` — it must clamp:
`least(now(), started_at + interval 'N' - interval '1 minute')`.

→ **Clamp and record, do not widen.** Loosening the constraint keeps the nineteen-hour row, which
is not data anybody wants. Capping it and writing *why* in the row's note ("durée plafonnée, à
corriger") is honest: the shop does not know when the person stopped, and a plausible invented
time is worse than a visibly capped one somebody can correct.

→ **One closer, called by everyone.** The rule drifted between four callers because it was
re-typed four times. A single internal `__close(...)` cannot disagree with itself.

→ **Found by driving the real thing, not by reading it.** The suite passed on all of this,
because PGlite fixtures are minutes old. Signing in as the real mechanic against the real project
and tapping the real button surfaced it in one call. Keep an end-to-end script that performs the
actual sequence a user performs — sign in, tap, read the board back — and run it after deploy.

## 28. `revoke ... from authenticated` on a function does nothing

An internal `SECURITY DEFINER` helper that takes a user id as a parameter must not be reachable
from a session, or it is a way to edit somebody else's records. So:

```sql
revoke all on function public.bal__close_job_clocks(uuid, text, uuid) from authenticated, anon;
```

A session could still call it. Postgres grants `EXECUTE` on every new function to **`PUBLIC`** by
default, and every role inherits that. Revoking from the specific roles leaves the `PUBLIC` grant
untouched, so the revoke looks deliberate and accomplishes nothing.

→ **Name `PUBLIC` first, then the roles.**

```sql
revoke all on function public.f(args) from public;
revoke all on function public.f(args) from anon;
revoke all on function public.f(args) from authenticated;
```

→ **Assert the negative, do not read the grant.** The revoke statement is not evidence. Ask the
database who can actually run it:

```sql
select has_function_privilege('authenticated', 'public.f(uuid, text, uuid)', 'execute');
```

A test that calls the function as a normal user and expects `permission denied` is better still —
that is what caught this one, after the revoke had already shipped looking fine.

→ **This applies only to functions.** Tables and views start with no grants, so the same mental
model does not transfer; it is specifically `CREATE FUNCTION` that is permissive by default.

## 29. A generic class name is a global, and someone else already took it

A new dashboard panel laid out bay cells with sensibly-named children:

```html
<div class="baycell"><div class="bn">Baie 1</div><div class="mech">…</div><div class="job">Libre</div></div>
```

The page then grew eight vertical lines running top to bottom, straight through the header, the
cards and the backdrop. Nothing in the component could draw a line.

`atelier.css` — loaded on the same page as the new `ui.css` — already declared:

```css
.job { position: absolute; top: 5px; bottom: 5px; … }   /* the schedule board's appointment block */
```

On the schedule the parent lane is positioned, so `top/bottom` resolve against it. Inside a bay
cell there is no positioned ancestor, so they resolved against the **viewport**: twelve divs,
each 1801px tall, anchored at y=7, each painting a full-height strip at its column's x.

Renaming `.job` → `.bay-state`, `.bn` → `.bay-n` fixed the lines and broke the layout a different
way, because `atelier.css` *also* declares `.bay-n`, as a 22px square badge — so the bay name was
squeezed into 22px and wrapped mid-label. Two collisions, same afternoon, same cause.

→ **Scoping your own selector does not protect you.** `.baycell .job { font-size: 11px }` is more
specific, but the other file's bare `.job` still *matches the element* and contributes every
property yours does not mention — including `position`. Specificity settles conflicts per
property; it does not stop an unrelated rule from applying.

→ **Every stylesheet loaded on one page shares one namespace.** `index.html` pulls in
`atelier.css`, `ui.css` and `document.css`; the tablet pulls `app.css`, `ui.css`,
`mecanicien.css`. A class invented in one is live in all of them.

→ **The dangerous rule is the unscoped one.** `.job { … }` reaches into anybody's component.
`.board .job { … }` cannot. Declaring component internals bare is what creates the landmine; the
person who later steps on it did nothing wrong.

→ **Check the name, do not reason about it.** Both of these would have taken one grep. After the
second, `app/classcheck.mjs` now reports every class declared in more than one stylesheet with at
least one unscoped declaration — it names `.bay-n` on the first run.

→ **Symptoms that look impossible are usually inherited.** "Lines across the whole page" has no
cause inside a 140px cell. When the symptom's scale does not match the component's scale, suspect
a rule from outside it, and get real geometry (`getBoundingClientRect` on everything, report
anything absurdly tall) rather than reading CSS and guessing. The probe named the twelve 1801px
`div.job`s in one run, after three wrong theories from staring at a screenshot.

## 30. The grants were never tested, only the policies

A security advisor flagged a view as `SECURITY DEFINER`. It was, on purpose — a directory of
businesses, meant to be readable by anyone signed in. The flag was still worth chasing, because
underneath it, a mechanic at one shop could edit **any shop in the product**:

```
PATCH /rest/v1/shop_directory?id=eq.<a shop he has never heard of>   →  200 OK
```

Three ordinary facts, each harmless alone:

- a `SECURITY DEFINER` view runs its statements as the view's **owner**;
- a single-table view with no aggregate is **auto-updatable** — Postgres rewrites `UPDATE view`
  into `UPDATE table`;
- the platform (Supabase) **grants ALL on new objects in `public`** to `anon` and `authenticated`.

The migration said `grant select on ... to authenticated`. Grants are additive: it took nothing
away, and `INSERT/UPDATE/DELETE` were already there from the default. So the view's writes ran as
its owner, straight past every RLS policy on the table.

→ **A test suite that builds its own roles proves policies, not privileges.** 580 assertions
covered who may read and write *under RLS*. Not one covered *what the role had been granted*,
because the harness created `anon` and `authenticated` by hand and they carried none of the
platform's defaults. The schema under test was not the schema in production.

→ **`GRANT` never removes anything.** Writing `grant select` reads like "select only" and means
"select, in addition to whatever is already there". If you mean only, `REVOKE ALL` first — from
`PUBLIC` as well as from the named roles.

→ **Treat views as read models and enforce it as a property, not per view.** One assertion —
"no view in this schema grants INSERT, UPDATE or DELETE to any caller" — covers every view that
will ever be added. Checking them individually means remembering, and nobody will.

→ **Run the platform's own advisor and read every ERROR, including the ones you believe are
intentional.** This one *was* intentional and still led straight to the hole. "Deliberate" is a
statement about the read; it says nothing about the write.

→ **Confirm the exploit before fixing, and re-run it after.** A 200 with the changed row in the
body is evidence; a theory about specificity is not. Same request afterwards: `403 permission
denied for view`.


## 31 — A throw above the `addEventListener` is a dead form, not an error

**Symptom.** Two complaints that sound unrelated: "when I click Téléphone or Courriel nothing
happens", and "I'm trying to log in with my password and it's not working". No error on screen.
The page looks finished.

**Cause.** One name in the wrong scope.

```js
let ctx = null;

(async function boot() {
  const pendingInvite = new URL(location.href).searchParams.get('invite');   // ← scoped to boot
  ...
})();

let wired = false;
function showSignIn() {
  if (wired) return;
  wired = true;                       // ← set before the work, so no second attempt

  if (pendingInvite && !ctx.signedIn) { ...cosmetics... }   // ← ReferenceError

  siButtons.querySelectorAll('button').forEach(b => { b.onclick = ... });  // never runs
  $('#signinForm').addEventListener('submit', ...);                        // never runs
}
```

`showSignIn` is module-level; `pendingInvite` was `const` inside the boot IIFE. Reading it threw,
and the throw landed *above* both the tile handlers and the submit listener. `wired` was already
`true`, so nothing retried.

**Why it presents as two separate bugs.** The tiles had no `onclick`, so clicking them genuinely
did nothing. The form had no submit listener, so pressing Enter fell through to the browser's
native GET submit — the page reloads to the same URL and sits there. That reads as "my password is
wrong", which sends you to check credentials, auth config and the API. The credentials were fine
the whole time.

→ **Attach handlers before anything decorative.** Wiring is the contract; placeholder text and
button labels are not. Ordering them the other way lets a cosmetic line take the form down.

→ **A latch set before the work makes a transient failure permanent.** `wired = true` at the top
means one bad load is forever. Set it after the wiring succeeds, or wrap each optional block so it
cannot reach the latch.

→ **`typeof el.onclick === 'object'` means `null` — no handler.** It is the cheapest possible
probe for "is this actually wired", and it reads as a pass if you skim it. Assert `'function'`.

→ **A module-level function cannot see an IIFE's `const`, and nothing warns you.** `node --check`
parses it happily; the lints pass; the bundle ships. Only running it finds it. After touching a
function's scope, list what the enclosing block declares and grep for those names below it.

→ **"Nothing happens" is a claim about behaviour, so test the behaviour.** Screenshots showed a
perfect card. Driving the real page over CDP — click the tile, read the DOM, type the real password,
press the button, check for a session — found it in one run. Three earlier passes reading the markup
found nothing, and one of them was in a signed-in profile where the function never ran at all.


## 32 — A call into another module, guessed rather than checked

**Symptom.** "The ask assistant is not working." The button renders, the cursor changes, the
click lands, and nothing happens. No error, no console warning, no visual change at all.

**Cause.** The handler called an interface that does not exist:

```js
function askAboutToday() {
  const q = buildQuestion();
  if (window.BAL_ASSISTANT && window.BAL_ASSISTANT.ask) return window.BAL_ASSISTANT.ask(q);
  const fab = document.querySelector('.fab, #assistantFab');   // nor this
  if (fab) fab.click();
}
```

Three guesses, three misses. The module exports `openAssistant()`, not a `BAL_ASSISTANT`
object; the floating button is `#asstFab`; and nothing in it could be handed a question at all —
`submit()` is private and needs a locale held in `init`'s closure.

**Why it fails silently.** Every guess was written defensively. `if (x && x.ask)` and
`if (fab)` are exactly the guards that stop a wrong assumption from throwing — so the wrong
assumption never announces itself. Defensive coding around an invented API converts a loud
`TypeError` on the first click into a button that does nothing forever.

→ **Before calling into another module, read its exports.** One `grep -n "^export"` would have
shown `initAssistant`, `openAssistant`, `closeAssistant` and no `ask`. The cost of checking is
seconds; the cost of guessing is a dead control that survives review, because reviewing a
plausible-looking call does not reveal that its target is fictional.

→ **A fallback chain of three guesses is not robustness, it is three chances to be wrong
quietly.** If one path is correct, call it. Guards belong around things that legitimately may
be absent — a module still loading — not around names you have not verified.

→ **If the capability does not exist, add it rather than reaching around it.** The fix was five
lines: export `askAssistant(text)` doing what the suggestion chips already did — set the input,
call `submit`. Reaching in through the DOM to fake a click would have worked today and broken
the next time the panel was restyled.

→ **A button must do something or say something.** Make the no-op branch visible: open the
panel, or report that it is not ready. Silence on click is the one outcome that teaches the
user the product is broken while telling the developer nothing.

→ **Test the behaviour, not the wiring.** Checking that the panel opens would have passed with
the question never sent. Driving the real click and waiting for a reply caught both this and a
second defect: the question was being sent as raw JSON, and the model read `unplaced_today` and
`today_without_bay` loosely enough to answer about "5 véhicules sans baie" — merging two
different figures into one wrong one. Prose in, accurate answer out.


## 33 — Markup copied out of the function that owned its variables

**Symptom.** A whole screen does nothing. No partial render, no broken layout — the button is
pressed and the view simply never appears. The console, if anyone looks, says
`ReferenceError: cars is not defined`.

**Cause.** A form branch contained a hand-written copy of another function's markup:

```js
// in vehicleField()
const cars = f.cars || [];
return `<select id="f_vehicle">${cars.map(...)}</select>`;

// in formPanel(), the quote branch — the same markup, pasted
return card('Nouvelle évaluation', '', clientField()
  + `<select id="f_vehicle">${cars.map(...)}</select>`   // `cars` is not in this scope
  + foot);
```

The markup came across. The `const` that fed it did not, because it lived in the function the
markup was copied *from*. Every attempt to open the form threw before drawing a single element.

→ **Copied markup brings its dependencies with it, and they are invisible.** The tag soup looks
self-contained; the half-dozen identifiers interpolated into it are what actually travel. If
the same control is wanted in two places, call the function that renders it — give it a
parameter if the two places differ. Here the difference was one `— Aucun —` option, and a
`{ optional }` argument removed the copy entirely.

→ **`node --check` does not catch this, and neither does a syntax-only CI step.** The file is
valid JavaScript. A name that is out of scope on *one branch* is a runtime error on that branch
and nothing at all anywhere else, so it survives every static gate that does not do real scope
analysis.

→ **It also survives review.** `${cars.map(...)}` reads as obviously correct. Nothing about the
line hints that the reviewer should go looking for where `cars` was declared — and it was
declared, forty lines up, in a different function.

→ **Render every branch.** The fix to the *process* was four lines in the live test: loop over
the form kinds, open each one, assert that a card and its fields exist. Testing the branch you
changed would have missed this, because the branch had been broken since it was written and
the change under test was something else.

→ **A screen that throws before its first element is indistinguishable from a dead button.**
The same symptom as pattern 32, reached a different way: there, a call into an API nobody
wrote; here, a reference to a variable nobody passed. Both are silent to the user and loud in
the console. Read the console on the live site, once, after any UI change.
