# Membership contribution + Roadside Mutual Aid Fund (8 Sept 2026)

Two things happened today: a **$100 membership contribution** was added to the driver
undertaking and wired into the database, and a **members' mutual aid fund** was designed from
scratch across three documents. The database part is live but **switched off**. The documents
are drafts awaiting Parliament.

Everything here is LoadQ, on the shared Supabase project `kzjptcpjpwlxfofzhyku`.

---

## 1. Database — applied, gate OFF

Three migrations, all applied to `kzjptcpjpwlxfofzhyku`:

| Migration | What |
|---|---|
| `loadq_membership_contribution` | table `loadq_memberships` + read helpers |
| `loadq_membership_rpcs_and_gate` | write RPCs, queue gate, `loadq_driver_by_number` extended |
| `loadq_membership_board` | admin/list-writer view of who owes |

**`loadq_memberships`** — one row per driver: `notified_at`, `notify_method`, `paid_at`,
`amount_cents`, `method`, `reference`, `card_issued_at`, `waived_at`/`waived_by`/`waive_reason`.
RLS on; reads for self, admins and list writers; **no write policy** — all writes go through
SECURITY DEFINER functions.

**Settings** (`loadq_settings`), mirroring the existing `require_undertaking` pattern:

```
require_membership     false      <-- THE GATE IS OFF
membership_fee_cents   10000
membership_grace_days  7
```

**Functions**

- `loadq_membership_ok(driver)` — true if paid, waived, **never notified**, or still inside
  the 7 days. The "never notified" case matters: a driver nobody told cannot be locked out of
  a deadline they never received.
- `loadq_membership_due_at(driver)`, `loadq_membership_status(driver)` (json, incl.
  `days_left`), `loadq_membership_fee_cents()`, `loadq_membership_grace_days()`,
  `loadq_require_membership()`
- `loadq_mark_membership_notified(uuid[], method)` — admin only. **Idempotent on purpose**:
  re-running a notify batch keeps the original `notified_at`. If it reset, every re-send would
  restart everyone's week and the deadline would never arrive.
- `loadq_record_membership_payment(driver, cents, method, reference, card_issued)` — admin only
- `loadq_waive_membership(driver, reason)` — admin only, reason mandatory (≥3 chars)
- `loadq_membership_board()` — admin/list-writer; sorted overdue → in_window → not_informed →
  paid → waived, so the top of the list is whoever is about to lose access

**Modified, not duplicated**

- `queue_entries_require_eligible()` — the membership check was added *below* the existing
  undertaking check, so all entry conditions stay in one readable function. Message:
  `membership contribution of $100.00 was due on 7 Sep 2026 — pay it to rejoin the queue`
- `loadq_driver_by_number()` — now also returns `membership` (the status json), so the tablet
  can show "signed, contribution outstanding" without a second round trip

**Verified**: the state machine was exercised against a real driver inside a rolled-back
transaction — no row → ok; notified 3d → ok, 4 days left; notified 8d → blocked; paid → ok;
waived → ok. 0 rows persisted afterwards.

### Turning it on

```sql
update loadq_settings set value = 'true', updated_at = now() where key = 'require_membership';
```

**Do not flip this before notifications actually go out.** Order matters: send first, stamp
`notified_at` on send, then flip. Check `loadq_membership_board()` first — it tells you exactly
who the gate would lock out.

### Two known limits

1. **Nothing sends the notification yet.** `loadq_mark_membership_notified` records that you
   notified someone; there is no MMS/email blast. When it is built, it must stamp `notified_at`
   *on send*, or the recorded date won't match the message the driver got.
2. **Admins and list writers bypass the gate**, exactly as they bypass the undertaking gate
   (early `return new`). Entries created with a null `auth.uid()` (service role) also bypass.
   All 27 queue entries in the 30 days before this work were self-added through the app, so the
   gate does bite in practice — but a line built by a writer at the point is not covered.

---

## 2. Documents — sources now in `docs/concord/`

They were being written in `~/Downloads` (per the user's standing preference) and existed
**only on the iMac**. The HTML sources are now committed so this machine can rebuild them.
PDFs are not committed — regenerate:

```bash
cd docs/concord
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf=out.pdf "file://$PWD/concord-loadq-engagement.html"
```

The user works from `~/Downloads`, so copy the HTML there before editing and copy it back.

### `concord-loadq-engagement.html` — the form drivers sign (7 articles)

Version 1 — septembre 2026, matching `2026-09-v1` in `loadq_undertakings`.

1 Objet · 2 Statut réglementaire · **3 Cotisation d'adhésion** · 4 Règles et amendes ·
5 Violence physique · 6 Acceptation · **7 Évolution du présent document**

- **Article 3** — $100. 3.1 amount, 3.2 what it gives (member card, admin costs, the *right to
  take part* in the Fund — explicitly **not** paid into the Fund), 3.3 the Fund ($20/day split
  **$6 aid reserve / $14 individual balance**), 3.4 deadline (new driver: before first entry;
  existing driver: **7 days from notification**).
- **Article 7** (new) — the document is expected to change. Versioned, published on loadq.ca and
  posted at the loading points, changes effective **7 days after notice**, continuing to queue =
  acceptance, a driver who doesn't accept may leave with no fine on that ground, and
  **7.5 no retroactivity**.
- The amber "À confirmer par le Parlement" block on the fines schedule was replaced by a green
  **adoption** block: fines *and* the contribution adopted by the leaders of the organisation on
  **8 September 2026**, amendable only by a further decision of Parliament.

### `loadq-fonds-reglement.html` — Fund rules for Parliament (14 articles)

1 Nature · 2 Participation · 3 Contributions · 4 What it may help with · 5 What it does not ·
6 Asking for help · 7 Committee · 8 The money · 9 False claims · 10 Annual redistribution ·
11 Pledging · 12 Credit facility · 13 Security over the vehicle · 14 Amendment/winding up

Key figures (all Parliament's to change): caps **$500/event, $1,500/participant/year**;
**30-day** waiting period; **6-month** minimum term; **25%** reserve floor; security deposit
capped at **50%** of consented balances.

### `loadq-fonds-simulation.html` — annex, 50 participants

Built on **real** activity: `loading_history`, 88 days (10 Jun – 8 Sep 2026), 78 active
drivers. Top 50 by activity = **725 days** in the window → **3,007 days/year** → **$60,140/year**
at $20/day. Does not include the $100 tickets — those are card + admin, not Fund money.

---

## 3. Decisions and the reasoning behind them

Written down because none of it is recoverable from the files.

- **"The fund is an insurance" was walked back.** Undertaking insurance in Ontario needs an FSRA
  licence; the test is whether members have an *enforceable right to be indemnified*. Article 1
  therefore states no member is entitled to a payment and all help is at the Committee's
  discretion. **That discretion is what keeps it lawful as mutual aid — do not edit it into a
  promise.**
- **Name**: *Fonds d'entraide routière / Roadside Mutual Aid Fund* in all three documents.
  "Mutual aid" states the legal character in the title. (Earlier drafts said "Contribution
  Fund"; a find-and-replace missed the French one because the name straddled a line break —
  watch for that in these files.)
- **The $20 splits $6 / $14** (was 8/12; tilted toward savings on request). Consequence: the aid
  reserve drops to **$18,042/yr**, which covers the light claim scenario but not the moderate
  one in a single year — it relies on carry-over plus the caps and Committee discretion.
- **The $100 is a ticket, not funding.** It does not enter the Fund. Stated explicitly in 3.2
  because a driver who pays $100 and is then asked for $20/day otherwise concludes the goalposts
  moved.
- **The company co-signs.** Article 12.2 says Concord Express acts as **co-borrower** and is
  liable for **the whole** debt, not just the deposit-secured part. Guardrails added: 12.9 caps
  total co-signed principal at the Fund's total balance and requires **Parliament's** approval
  per co-signature; 12.10 forbids co-signing without the Article 13 security.
- **Repossession only works if registered.** Article 13.1 requires a **PPSA** registration with
  the organisation as secured party on the vehicle permit — a clause in a members' agreement
  does not let anyone take a car. 13.8 states Ontario law overrides the article, deliberately: an
  overreaching repossession clause gets struck down entirely, leaving no remedy at all.
- **Waiting period + minimum term + arrears suspension** are the only three defences a voluntary
  fund has against someone joining the morning of their breakdown.

---

## 4. Open

- **No Fund enrolment form exists.** Article 2.2 (joining in writing), 12.3 (written consent
  before a balance is pledged) and 13 (agreement to the vehicle security) all require signatures
  with no document to sign. This is the next thing to draft.
- **Adoption date** is filled (8 Sept 2026) in both documents; the Fund rules signature block for
  Parliament is still blank.
- **"Leaders" vs "Parliament"** — the adoption lines say *leaders of the organisation*; every
  other clause vests authority in *Parliament*. If they are the same body, pick one term across
  all three documents.
- **Credit union not yet approached.** Candidates: Alterna Savings (Ottawa-founded, ~$10B),
  Desjardins Ontario CU (Ottawa-Cyrville, and covers Gatineau), Your Credit Union. The unusual
  ask is third-party security — the Fund's deposit securing a member's loan. Unconfirmed that
  any of them offer it.
- **A lawyer should read** Article 1 of the Fund rules (mutual aid vs insurance), the PPSA
  mechanics in Article 13, and whether co-signing member loans affects Concord Express's own
  credit standing.
- Still outstanding from earlier: **roll the exposed `sk_live_` Stripe key** and **revoke the
  exposed Facebook user token**.

## 5. Chris Therrier — closed pending confirmation

The $44.50 Interac refund **was sent on 8 Sept 2026**. `loadq_ride_requests`
`98b2b3f1-1bc2-47b4-9ab0-c21e590fc29a` (Pierrefonds QC → Ottawa, fare $44.49, `refund_cents`
4450) now records it in `notes` — there is **no `refunded_at` column**, so the notes field is
the only place that distinguishes "refund owed" from "refund sent". Worth adding a real column
if refunds become common.

A **follow-up on 11 Sept** by MMS, SMS and email is to ask whether he received it
(613-710-1009 · mrchrisfinances@gmail.com). It is scheduled as a session-only reminder on the
iMac, so **it will not survive that session ending** — if nothing has gone out by 11 Sept,
send it from here.
