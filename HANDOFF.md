# Kolis / Concord Express — session handoff

_Last updated: 2026-09-11. Snapshot so work can continue on any machine (`git pull`, start a fresh Claude session, say "continue the Kolis work")._

## Latest session — 2026-09-11 (LoadQ driver ride-navigation screen)

**Why.** A `route_pickup` passenger ride (LQ-46B0D, 2026-09-05: Chris T, Pierrefonds → Ottawa,
$44.50 paid via Interac, auto-assigned to Dolly Kilimba) **stalled right after the driver accepted.**
Root cause: a driver could accept an offer (`loadq_ride_offer_respond`) but there was **no screen and
no data to navigate to the passenger** — the offers RPC returns only a text label (no pickup
coordinates, no passenger phone), there was no "on my way" step, and location was captured **once** at
accept and never again (no live tracking, no ETA). The trip never advanced past `assigned`. This
session builds that missing screen + the two backend RPCs it needed.

### What was built

**1. Two new DB RPCs — ALREADY APPLIED to prod (`kzjptcpjpwlxfofzhyku`) on 2026-09-11, and committed
as a migration.** File: `supabase/migrations/20260911160000_loadq_ride_active_nav.sql`.
- `loadq_ride_active()` → the driver's current active ride (status `assigned`/`en_route`/`picked_up`),
  full detail incl. **pickup lat/lng, passenger name + phone, destination, fare, departure zone**;
  gated to `driver_id = auth.uid()`. Returns `{active:false}` when none. *This is the piece that was
  missing.*
- `loadq_ride_start(p_request_id)` → `assigned` → `en_route` ("I'm on my way"), stamps `started_at`.
- Both `security definer`, granted to `authenticated, anon, service_role` (same as the other ride RPCs).
- The migration is **idempotent** (`create or replace`) — safe to re-run if `supabase db push` replays it.

**2. Driver navigation screen (web).** File: `admin-web/app/ride/page.tsx` → route **`/ride`** →
after deploy: **https://admin.loadq.ca/ride**. Single self-contained client component, no new deps.
- ⚠ **This is a LoadQ page — it must live on LoadQ's domain, NOT Kolis.** LoadQ and Kolis are separate
  businesses (linked only because Kolis parcels ride along LoadQ). The `admin-web` codebase builds
  **three** independent Netlify sites — `business.kolis.ca` (Kolis), `quorly.ca` (Quorly), and
  **`admin.loadq.ca` (LoadQ ops: /sheet, /board, /sheet/incident)**. `/ride` ships on **admin.loadq.ca**.
  (Do NOT publish it to business.kolis.ca.)
- Built as a **web page** (not a native app screen) on purpose: matches how offers already reach
  drivers (SMS link + browser geolocation), deploys with no App/Play Store release, works on any phone.
- Runs on the driver's own Supabase auth session (same `@/lib/supabase` as the LoadQ sheet). If there's
  no session it shows a sign-in prompt (`/login`).
- Full flow on one screen: **see offer → Accept/Decline** (`loadq_ride_driver_offers` +
  `loadq_ride_offer_respond`) → **navigate to pickup** (`loadq_ride_active` feeds coords + passenger
  phone; opens Google/Apple Maps) → **I'm on my way** (`loadq_ride_start`) → **live location ping every
  15 s** (`loadq_ride_driver_ping`, auto-flips to picked-up within 50 m) → **passenger on board**
  (`loadq_ride_mark_picked_up`) → **navigate to destination** → **Complete** (`loadq_ride_complete`).
- One-tap **call passenger** (`tel:`), live distance readout, 4-step progress bar.
- **3 themes** (light / medium / dark) + **FR/EN**, both remembered per device
  (`localStorage: loadq_ride_theme`, `loadq_ride_lang`; FR + dark default). Matches the approved mockups:
  `~/Downloads/LoadQ-Driver-Ride-Mockup.png` (dark) and `LoadQ-Driver-Ride-Mockup-Themes.png` (light+medium).
- Typechecks clean (`cd admin-web && npx tsc --noEmit`).

### Deploy on the iMac — to admin.loadq.ca (site `loadq-admin`, id `74c65dc0-8ee8-4884-a688-eb42d5eb3ea5`)
⚠ **Deploy from THIS iMac only, and NOT with `./deploy-prod.sh`** (that publishes business.kolis.ca = Kolis).
⚠ **The `/board` route lives only in the iMac's local unpushed code** — deploying admin-web to `loadq-admin`
from a machine without `/board` wipes it and 404s the whole site (has happened once). The iMac has it, so
deploy there. See `DEPLOY-NOTES-loadq-admin.md`.
1. `git pull` (brings in `app/ride/page.tsx` + the migration) — keep your local `admin-web/app/board`.
2. RPCs are **already live in prod** (applied via Management API this session). Nothing to run for the DB.
   If you prefer, `supabase db push` replays the migration harmlessly (idempotent).
3. Build + deploy admin.loadq.ca the way you already do — e.g.
   `netlify deploy --build --prod --site 74c65dc0-8ee8-4884-a688-eb42d5eb3ea5`
4. Verify (both must still work):
   - `curl -sI https://admin.loadq.ca/board/ottawa-universal-grocery` → 200 image/png (proves /board survived)
   - open **https://admin.loadq.ca/ride** on a phone while signed in as a driver.
- Optional nicety: add a redirect on the static **loadq.ca** site so `loadq.ca/ride` → `admin.loadq.ca/ride`
  (cleaner to text drivers). loadq.ca is the separate static marketing site (`comfy-melomakarona-e176a0`).

### To test end-to-end without waiting for a real rider
- Sign in as a driver who has a pending offer, or seed one: insert a `loadq_ride_requests` row
  (kind `route_pickup`, `departure_zone_id='montreal-burger-king'`, pickup lat/lng set) then
  `loadq_ride_offer_next(<request_id>)` to offer it to the front driver; open `/ride` as that driver.
- Watch `loadq_ride_requests`: `driver_loc_at` should now update **continuously** (every ~15 s), and
  `status` should walk assigned → en_route → picked_up → completed as the buttons are tapped. (Contrast
  with LQ-46B0D, where `driver_loc_at` was written once and never again.)

### Follow-ups (not done — need a decision or info I couldn't see locally)
- **Wire the SMS offer to this page.** The offer SMS is sent by the deployed edge fn
  `loadq-ride-cascade` (source is NOT in this checkout — pull it with
  `supabase functions download loadq-ride-cascade` on the iMac). Add the driver link
  `https://admin.loadq.ca/ride` (or `https://loadq.ca/ride` if the redirect above is added) to that SMS
  body so drivers land here on accept. Until then drivers reach the screen by bookmark/manual open.
- **Real map tile (optional).** The map strip is a styled placeholder with a live-distance overlay
  (honest, not a fake route). To show a real map, drop a Google Static Maps `<img>` in `RidePage`'s
  `.map` block using `NEXT_PUBLIC_GMAPS_KEY` + the pickup/driver coords (markers + path). Left as a stub
  to avoid a hard maps-key dependency on first deploy.
- **`en_route` has no other setter** — only this screen sets it. Fine today; note it if another client
  needs it.

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
