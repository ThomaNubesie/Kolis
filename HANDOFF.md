# Kolis / Concord Express — session handoff

_Last updated: 2026-08-08. Snapshot so work can continue on any machine (`git pull`, start a fresh Claude session, say "continue the Kolis work")._

## Latest session — 2026-08-08 (no-percentage scrub + instant click→AI follow-up)

**Zero percentage/commission to merchants — enforced everywhere.** The internal courier margin (20% / 15% / 12% by plan) must NEVER appear on any merchant-facing surface. Scrubbed this session:
- **Public website (`admin-web/components/Landing.tsx`).** Pricing section previously showed a big **"20% — of the total delivery price · Monthly billing on account"**. Replaced with **"Per shipment — priced by the package you send · no subscription · no monthly fee · no minimums · Ontario & Québec"**. Deployed to business.kolis.ca. (Landing renders at the app root via `app/page.tsx`.)
- **`kolis-prospect-advisor` edge fn.** Its base prompt told the AI to write "20% of the delivery price / billed monthly on account" into merchant proposals/emails/scripts, and leaked the internal "Kolis pays the courier out of that 20%" note. Rewritten: pricing framed as **per-shipment, package-based, no subscription/monthly/minimum**, plus the same HARD RULE as `kolis-followup-ai` (NEVER mention any %/commission/margin/markup). Deployed `--no-verify-jwt`.
- The `fee: "20%/15%/12%"` field in `admin-web/app/shipper/plans/page.tsx` is **dead data** — not rendered anywhere, so nothing visible there. The 20% still lives ONLY in internal billing logic (`kolis-stripe-webhook` `PLAN_FEE`), never shown.

**Click → AI follow-up is now instant + never missed.** A prospect click should immediately produce an AI follow-up suggestion emailed for approval. Root cause of earlier misses (Aug 7): `kolis-followup-ai` had been deployed `verify_jwt=true`, so `concord-outreach-webhook`'s internal `x-kolis-secret` call 401'd at the gateway and no draft was ever generated — the one draft that existed (Bio-Test) was a later manual trigger. Fixes:
- Redeployed **`kolis-followup-ai` `verify_jwt=false`** (the whole chain — `concord-outreach-webhook` → `kolis-followup-ai` — is now `verify_jwt=false`, so clicks draft instantly). This matches the [[kolis-notify-verify-jwt]] rule: notify/webhook fns MUST be `verify_jwt=false` or the gateway 401s and it silently dies.
- Approval notifications now go to **both** `shaloderick@concordexpress.ca` AND `shaloderick@gmail.com` (`ADMINS` array in `kolis-followup-ai`; `resendSend` accepts a `to` array). Previously only concordexpress.ca — which is why only one inbox saw it.
- `concord_outreach` drafts live in `followup_draft_subject/_body/_next_steps` (+ `followup_approve_token`, `followup_ai_sent_at` stamps the send to the PROSPECT, not the admin notification). Approve link: `kolis-followup-ai?action=approve&id=&token=`.

## Latest session — 2026-07-31
**PAYG payment gating.** Card parcels no longer notify the recipient at creation. New `kolis_parcels.payment_status` (pending→authorized→paid). Cron `kolis-payment-sync` (job 12, every min) polls Stripe → on authorization activates the parcel + fires the `created` notification; auto-cancels abandonments (>30 min, scoped to last 3h). Capture-on-delivery via `kolis-finalize-payment` (blocks delivery unless captured). Revenue (`kolis_admin_revenue`) now counts **captured** (`payment_status='paid'`) as collected, authorized+paid as billed — not "has a PI".

**Notifications.** `kolis-notify-recipient` MUST stay **`verify_jwt=false`** — the drain (`kolis_notify_drain`, cron) calls it with `x-kolis-secret`; if a redeploy flips verify_jwt on, the gateway 401s and ALL notifications silently die (happened ~Jul 28, fixed). Recipients without email are reached by Twilio SMS. Audiences: created/incoming/picked_up/in_transit/delivered → recipient; `pickup` → sender.

**External-driver custody (out-of-network couriers, no app).** Table `kolis_external_custody` + `custody-proof` bucket + fn `kolis-custody` (OTP verify → GPS pickup 1000 m → deliver by recipient code OR unattended photo+GPS → escrow capture → **QR deactivates on delivery**). Driver page LIVE at **business.kolis.ca/d?t=<token>** (`admin-web/app/d/page.tsx`). Activate: POST `{action:'create'}` with `x-kolis-secret` + parcel_id/driver_name/driver_phone/driver_vehicle → text them the link.

**Hub drop-off time questionnaire.** `kolis_parcels.dropoff_slot`/`dropoff_token` + fn `kolis-dropoff` + page LIVE at **business.kolis.ca/dropoff?t=<token>** (`admin-web/app/dropoff/page.tsx`). Sender picks day+slot → saved + emailed to **marketing@concordexpress.ca**.

**Helpers.** `kolis-admin-sms` + `kolis-admin-email` (both `x-kolis-secret`-guarded; one-off SMS/email via Twilio/Resend).

**Platform gotcha.** Supabase serves HTML as `text/plain` from BOTH `functions.supabase.co` AND storage public URLs (anti-phishing) → all user-facing pages MUST live on business.kolis.ca; edge functions = JSON only. (`htmltest` fn was a throwaway; safe to delete.)

**Hubs.** Only **Scarborough Town Centre** + **Yorkdale Mall** are immediate-departure; **Union Station** to be removed from options (not done yet). Distances from Union: Yorkdale 10.5 km, Scarborough 17.6 km.

### Open items
- **KL-3204** (Toronto→Montréal; sender Olivia Ebenye `oliviaepee@yahoo.ca` / 647-408-2740; recipient Brigitte Chatue; $48 **authorized-uncaptured**, hub=Yorkdale): needs the external driver's name+phone to activate the custody link. Ebenye already sent the drop-off questionnaire (email+SMS). **Deliver before ~Aug 6** or the $48 auth expires.
- `kolis-custody` `create` returns a `kolis.ca/d` link string — should be `business.kolis.ca/d` (fix on next function touch; harmless, link built manually at activation).
- Add a "delivered → reject" guard to in-network `kolis-scan` (scan_token is already nulled on delivery).
- New sending-process changes (recipient email+phone required; Union Station removed; questionnaire in-flow; auto-label to recipient; sender email from account) — **mocked, not built**.

## What this project is
Concord Express Co Inc. runs three surfaces on **one Supabase project `kzjptcpjpwlxfofzhyku`**:
- **`admin-web/`** — Next.js 14 app. Portals: `/admin` (staff), `/shipper` (business clients / "Kolis Business Desktop"), `/carrier`, `/developer`. Deployed to Netlify site **`kolis-business` → https://business.kolis.ca**.
- **`app/` + root** — Kolis mobile app (Expo/RN, EAS builds). Consumer parcel send + tracking + driver "carrying".
- **`~/Desktop/LoadQ`** (separate repo) — LoadQ driver queue app (Expo/RN).

## Deploy / how changes go live
- **admin-web:** NOT connected to GitHub. Deploy with `./deploy-prod.sh` from the Kolis repo root (uses Netlify CLI; needs `netlify login` or `NETLIFY_AUTH_TOKEN`). Site id `da1cce8c-6a5b-4428-b46c-5267c0abc2a2`. If the npm cache errors, run with a fresh cache dir (`npm_config_cache=/tmp/npmcache`).
- **DB + edge functions:** applied directly to Supabase (MCP `apply_migration` / `deploy_edge_function`), so they're already live/shared — no per-machine copy.
- **Mobile apps:** EAS builds; iOS submit via App Store Connect (Kolis Apple ID `shaloderick@yahoo.com`).
- **Branches:** Kolis on `ship-kolis-1.1.0`, LoadQ on `ship-loadq-1.2.6`. Pull/push these to stay mirrored across machines.

## Key IDs / conventions
- Admin impersonation for `execute_sql`: `set_config('request.jwt.claims','{"sub":"329b4603-355c-4058-895c-37826ef147ca","role":"authenticated"}', true)` (Thomas Shalo, staff/admin).
- Orgs: **Elevate** `bcf40c1e-7562-44c5-83bd-21ebd5df56d7`, **African World Market** `56d1ba38-5903-48e6-856b-be0e5bf3dcde`.
- LoadQ zones live in `public.zones`; queue in `public.queue_entries`. **Tracking off = `zones.manual_queue = true`** (all zones set this way now). **Always attach the driver's vehicle (`queue_entries.vehicle_id`) when posting a queue.**
- LoadQ paper-list shorthand: **STM = Symplice Mekam** (`39f791dc-…`). "Dodge 02 / Doge 62" = Sinclair.
- Do **not** mention Poparide in anything public-facing.

## What was built/changed this session (all live)
1. **Business Desktop shell** for `/shipper` — full-width top bar (Ko logo, search, help, settings, apps-grid switcher), business name + grouped scrollable tabs (SHIP/GROW/MONEY/WORKSPACE), FR/EN + Sign-out footer. Scoped `bp-*` classes in `globals.css` (other portals untouched).
2. **New shipment (`/shipper/create`)** — From-my-clients multi-select recipients (editable cards, mandatory city/address/email/phone), shared mandatory contents, **insurance** (manual = required declared value + insure/decline; bulk = opt-in per parcel, 5% premium), **Review-charges → Confirm** modal, per-line pricing.
3. **Labels** — server-side PDF edge fn **`kolis-label-pdf`** (pdf-lib) → Download PDF + Email on `/shipper/label/[code]` and the batch `/shipper/labels`. Auth via `kolis_org_label`.
4. **Same-tab nav + Back buttons** (removed new-tab opens across shipper pages).
5. **Pricing groups** — `/admin/pricing` page + `kolis_price_groups` / `_rules` / `_members`, materialized into `kolis_org_price_overrides` (tagged `group_id`). Group **"Montreal 25 Ottawa 15"** (tax-INCLUSIVE): Montréal $25 (incl. Laval + island suburbs), Ottawa/NCR $15 (incl. Gatineau/Outaouais). Members: Elevate + African World Market. Prices grossed down per destination province. `kolis_city_province` extended so Outaouais + Montréal suburbs map to QC.
6. **Revenue** — `kolis_admin_revenue` now includes **PAYG card charges** (was invoices-only), exact cents. Org drill-in **`/admin/revenue/[id]`** + `kolis_admin_org_transactions` RPC: all transactions (shipments + invoices) with expandable full detail.
7. **Billing** — "Kolis credit" card on `/shipper/billing`; `kolis_org_overview` returns `credit_cents`. Elevate granted **$20 credit** (`kolis_org_add_credit`).
8. **Driver name fix** — `kolis_admin_parcels` resolves `driver_name` via `kolis_profiles` → linked LoadQ driver (parcels store the courier profile id, not the drivers id).
9. **`kolis-notify-recipient`** — tags transactional emails with `parcel_id` + records a `sent` row so delivery/open events log to `kolis_email_events`; also fixed missing `recipient_lang` in the select.
10. **LoadQ ops** — tracking off for all zones; daily queue postings with vehicles (Universal Grocery→Montréal, Berri→Ottawa, Burger King→Ottawa, Université Laval→Montréal + Dr Nico).

## Open / pending
- iOS submissions the user does manually in App Store Connect (version + attach build + submit): **Kolis 1.1.7**, **LoadQ 1.2.15 (build 23)**.
- **`.netlify/` and `.next/` build output are tracked in the repo** and churn on every deploy → recommend adding `admin-web/.netlify/` and `admin-web/.next/` to `.gitignore`.
- Legal: a **mise en demeure** from Claude Xavier Nkolo ($6,100) — a full rejection-letter draft exists (rejecting fees for no-contract work + the $1,000 as at-risk investment); user to send after paralegal review. Not a code task.
