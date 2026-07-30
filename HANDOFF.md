# Kolis / Concord Express — session handoff

_Last updated: 2026-07-30. Snapshot so work can continue on any machine (`git pull`, start a fresh Claude session, say "continue the Kolis work")._

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
