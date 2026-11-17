# LoadQ Morning Raffle — Technical Spec

**Status:** Draft for build · **Author:** Concord Express / LoadQ · **Date:** 2026-10-30
**Supabase project:** `kzjptcpjpwlxfofzhyku` · **App repo:** this repo (`repos/Kolis`)

---

## 1. Purpose & goals

Replace the handwritten morning sign-up sheet (which drivers have found ways to game — arriving to write names early, reordering, proxy entries) with a **provably fair, tamper-proof lottery** that builds the daily departure order automatically.

**Hard requirements (decided with Thomas):**

1. **Equal chance among everyone physically present.** The number a driver gets is random; *when* they check in does not affect their odds.
2. **Hard cutoff.** Default `06:01:00` local. Present + checked in by then, or excluded for the day. No late entries, no exceptions.
3. **Presence proven two ways:** GPS geofence at the lot **and** a rotating code posted on-site.
4. **Provably fair.** A driver can verify the draw was not rigged.
5. **Per-zone switch.** The feature is turned on/off and configured per pickup zone (Universal Grocery first; any zone later).
6. **No downstream change.** The drawn order flows into the existing queue (`queue_entries` + `loadq_sync_loader`), so loading clock, seats, and return routing (Namur/Berri) behave exactly as today.

**Non-goals:** changing how returns are routed; changing pricing; replacing the admin manual-post path (kept as a fallback/override).

---

## 2. Fairness model (the heart of it)

A **commit–reveal lottery**. One round per zone per service day.

- **At check-in open** (e.g. 05:45): the server generates a secret 32-byte seed `S`, and publishes `seed_commit = sha256(S)` on the round — visible to everyone **before anyone checks in**. This binds the server: it chose `S` before it knew who would enter, and the revealed `S` must hash to the committed value.
- **Drivers check in** during the window (presence-verified, one per driver).
- **At the cutoff** (`06:01:00`): the server, in one transaction, assigns each entrant a number by a **deterministic shuffle keyed by `S`**, then reveals `S`.

**Deterministic shuffle (verifiable):** for each entrant, `key = sha256(S || driver_id)`. Sort entrants ascending by `key`; that order is positions `1..N`. Ties (astronomically unlikely) break by `driver_id`.

**Why this can't be gamed:**
- *No re-roll:* one check-in per driver, number assigned once, atomically.
- *Tap order irrelevant:* your `key` depends only on `S` and your `driver_id`, not on when you tapped → equal odds for everyone present.
- *No server favoritism:* `S` is committed before entrants are known; the revealed `S` must match the commit.
- *No silent exclusion:* the entrant list (driver ids + check-in timestamps) is published on the live board and in the round record; if you checked in and aren't in the revealed set, that's provable.
- *Collusion gives nothing:* even a driver who knew `S` in advance can't change their fixed `key` or anyone else's.

**Verification (any driver, after the draw):** take the published entrant `driver_id`s and revealed `S`; recompute each `key = sha256(S || driver_id)`; sort; confirm the numbers match, and `sha256(S) == seed_commit`.

---

## 3. Per-zone configuration

New table `public.loadq_raffle_config`, one row per zone the raffle can run in.

| column | type | notes |
|---|---|---|
| `zone_id` | text PK → `zones.id` | the pickup zone |
| `enabled` | bool | master switch for this zone |
| `destination_region` | text | where the drawn line goes (e.g. `montreal`) |
| `checkin_opens_local` | time | e.g. `05:45` |
| `draw_at_local` | time | the cutoff, e.g. `06:01:00` |
| `timezone` | text | e.g. `America/Toronto` (DST-aware) |
| `geofence_lat` / `geofence_lng` | double | lot center |
| `geofence_radius_m` | int | e.g. `100` |
| `max_gps_accuracy_m` | int | reject check-ins with worse accuracy (e.g. `60`) |
| `require_geofence` | bool | default true |
| `require_code` | bool | default true |
| `code_len` | int | default `4` |
| `code_rotation` | text | `daily` \| `window` (new code each round) |
| `late_policy` | text | `excluded` (default, per Thomas) \| `append` (kept for flexibility) |
| `one_checkin_per_device` | bool | block/flag same device entering >1 driver |
| `max_slots` | int null | optional cap on entrants |
| `created_at` / `updated_at` | timestamptz | |

Turning the raffle on for a new zone = insert/enable a config row + set its geofence and times. Nothing else.

---

## 4. Data model

### 4.1 `loadq_raffle_round` — one per zone per day
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `zone_id` | text → zones | |
| `service_date` | date | local service date |
| `destination_region` | text | copied from config at creation |
| `status` | text | `scheduled` → `open` → `locked` → `drawn` (or `cancelled`) |
| `checkin_opens_at` | timestamptz | computed from config + date + tz |
| `draw_at` | timestamptz | the cutoff instant |
| `seed_commit` | text | `sha256(S)` published at open |
| `seed_reveal` | text | `S`, null until drawn |
| `code` | text null | the day's code (admin-visible only) |
| `entrant_count` | int | filled at draw |
| `drawn_at` | timestamptz null | |
| | | **unique(`zone_id`,`service_date`)** |

### 4.2 `loadq_raffle_checkin` — one per driver per round
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `round_id` | uuid → round | |
| `driver_id` | uuid → drivers | |
| `vehicle_id` | uuid → vehicles | driver's active car at check-in |
| `checked_in_at` | timestamptz | **server** clock |
| `device_id` | text | anti multi-device |
| `geo_lat`/`geo_lng`/`geo_accuracy_m` | double/int | captured |
| `geo_ok` / `code_ok` | bool | validation results |
| `assigned_number` | int null | filled at draw |
| `status` | text | `checked_in` → `drawn` (or `voided`) |
| | | **unique(`round_id`,`driver_id`)** |

### 4.3 `loadq_raffle_audit` — immutable admin-action log
`id, round_id, actor_id, action (override_add|override_remove|reorder|cancel|redraw|code_view), detail jsonb, created_at`. Append-only; surfaced on the board so overrides are never silent.

**RLS:** rounds + entrant list (driver_id, assigned_number, checked_in_at) are **readable by all authenticated drivers** (transparency). `code` and `seed_reveal`-before-draw are **admin-only**. Writes go only through the RPCs below (security definer); direct table writes blocked.

---

## 5. Lifecycle / state machine

Per zone, per day, driven by the server clock (never the phone's):

```
scheduled ──(checkin_opens_at)──► open ──(draw_at)──► locked ──(draw runs)──► drawn
                                    │                                   
                                    └── drivers check in here only       
```

1. **Open** (`checkin_opens_at`, e.g. 05:45): create the round if absent, generate `S`, store `seed_commit`, generate `code` (if required). Status `open`.
2. **Check-in window** (open → draw_at): drivers submit presence. Each valid submission creates a `checkin` row.
3. **Cutoff** (`draw_at` = 06:01:00): no new check-ins accepted (enforced on insert by `now() < draw_at`). Status → `locked`.
4. **Draw** (runs at/just after cutoff, idempotent): assign numbers, write to `queue_entries`, reveal `S`, run `loadq_sync_loader`. Status → `drawn`.

---

## 6. Presence verification

Both checks run **server-side** at check-in; the phone only supplies data:

- **Geofence:** app sends `lat/lng/accuracy`. Server requires `distance(center, point) ≤ geofence_radius_m` **and** `accuracy ≤ max_gps_accuracy_m` (rejects low-confidence/jumpy fixes that smell like spoofing). Captured coords stored for audit.
- **Code:** driver enters the day's code; server compares to `round.code`. The code is shown to the on-site poster via an admin-only RPC at ~06:00 and changes each round (`code_rotation`). A code alone can't check you in (geofence still required); geofence alone can't either (code required).
- **Identity/anti-proxy:** check-in requires the driver's own authenticated session (`auth.uid()` ↔ driver). `one_checkin_per_device` flags/blocks the same `device_id` entering more than one driver per round.
- **Clock authority:** insert rejected if `now() < checkin_opens_at` or `now() ≥ draw_at`. Changing the phone clock does nothing.
- **Eligibility:** reuse existing queue eligibility — must be a real, **verified**, non-`blocked` driver with an active vehicle (same gate as `queue_entries_require_eligible`).

---

## 7. API surface

### Driver-facing RPCs (security definer, `auth.uid()` = driver)
- `loadq_raffle_current(p_zone)` → the open/active round for a zone: status, `checkin_opens_at`, `draw_at`, `seed_commit`, entrant_count, and the caller's own check-in (if any). Read-only; safe to poll for the live board.
- `loadq_raffle_checkin(p_zone, p_lat, p_lng, p_accuracy, p_code, p_device_id)` → validates window + geofence + code + eligibility, creates the check-in (unique per driver), returns `{ok, checkin_id}` or a typed error (`window_closed`, `not_at_lot`, `bad_code`, `already_checked_in`, `not_eligible`, `low_gps_accuracy`, `duplicate_device`).
- `loadq_raffle_result(p_round)` → after draw: caller's `assigned_number`, full ordered list, `seed_reveal`, `seed_commit`, entrant list — everything needed to verify.

### Admin RPCs (admin-gated)
- `loadq_raffle_code(p_zone)` → today's code to post at the lot.
- `loadq_raffle_monitor(p_zone)` → live entrant feed.
- `loadq_raffle_override(p_round, action, payload)` → add/remove/reorder post-draw; writes `loadq_raffle_audit` and re-syncs the loader.
- `loadq_raffle_cancel(p_round)` / `loadq_raffle_redraw(p_round)` → emergency; logged.

### Scheduled (pg_cron / edge)
- **Open job** (every minute): for each `enabled` config whose `checkin_opens_at` (today, tz-aware) has arrived and has no round yet → create + open round (seed, commit, code).
- **Draw job** (every minute): for each round past its `draw_at` still in `open`/`locked` → run the draw (idempotent: only acts if not already `drawn`). Retries next minute if the server missed the exact tick; check-ins are already closed by the cutoff regardless.

---

## 8. The draw (pseudocode, single transaction)

```
lock round FOR UPDATE; if status = 'drawn' then return.   -- idempotent
set status = 'locked'.
entrants := all checkins for round, ordered by driver_id. -- canonical
for each e: e.key := sha256(S || e.driver_id).
order entrants by key asc, driver_id asc.                 -- the shuffle
n := 0
-- clear the zone's current non-ended line + each entrant's cross-zone active entry
delete from queue_entries where zone_id = round.zone_id and status <> 'ended';
delete from queue_entries where driver_id in (entrants) and status <> 'ended';
for each e in order:
    n := n + 1
    e.assigned_number := n
    insert into queue_entries(zone_id, driver_id, vehicle_id, position = n,
        status='waiting', destination_region = round.destination_region,
        seats_boarded=0, seats_locked=0, seat_states='[]', joined_at=now());
    update checkin set assigned_number = n, status='drawn';
round.seed_reveal := S; round.entrant_count := n; round.status := 'drawn'; round.drawn_at := now();
select loadq_sync_loader(round.zone_id, round.destination_region);  -- #1 → loading + clock
```

Seats come from `vehicles.seats` (posted exactly as stored). Returns routing is untouched — the 3-hour repost reads `loadq_return_zone` per driver as it does today.

---

## 9. Integration with the existing queue

- **Writes into `queue_entries`** exactly like the manual morning post, so everything downstream is unchanged: `loadq_sync_loader` promotes #1 to `loading` with the 3h clock; the depart/heal and seat logic are identical; the Depart→Berri/Namur 3h repost (`loadq_post_due_returns` / `loadq-ug-returns` + `loadq_return_zone`) just works.
- **One-active-per-driver** (`queue_entries_one_active_per_driver`) respected by clearing cross-zone active rows before insert.
- **Manual post path stays** (`loadq-post.mjs`) as an admin fallback and for zones with the raffle off. For a raffle zone, the manual post is effectively replaced by the 6:01 draw; admin overrides go through `loadq_raffle_override` so they're logged.

---

## 10. Threat model & mitigations

| Attack | Mitigation |
|---|---|
| Re-roll until low number | One check-in per driver (unique); number assigned once, atomically |
| Tap first to get ahead | Number = `sha256(S‖driver_id)` — independent of check-in time |
| Check in from home / bed | Geofence **and** rotating on-site code, both required |
| GPS spoofing | Accuracy threshold + both-factor requirement; coords logged for audit |
| Proxy (friend checks you in) | Own authenticated session; device-dedupe; code is on-site only |
| Change phone clock to beat cutoff | All timing uses server `now()` |
| Rigged shuffle / server favoritism | Commit-reveal: `seed_commit` published before entrants; revealed seed must match |
| Silent exclusion of a valid entrant | Entrant list public on the board + in the round; recomputable |
| Admin quietly moves a friend up | Overrides require `loadq_raffle_override`, logged to `loadq_raffle_audit`, shown on board |
| No-show winner blocks a slot | Existing depart/heal releases the slot after the load window |

---

## 11. App screens (React Native, driver app)

1. **Check-in** — auto-detects geofence ("At the lot ✓" / "Move closer"), 4-digit code entry, one **"I'm here"** button; shows live entrant count and a countdown to the 6:01 lock. Disabled before open and after cutoff.
2. **The draw / spin** — at 6:01 the spinner animates and reveals the driver's number; shows the fairness line ("everyone present had equal odds") and a **Verify** affordance.
3. **Live board** — shared read-only ordered list, #1 loading, caller's row highlighted; fills in as the draw completes; shows "Locked 06:01:00".
4. **Verify** (tap-through) — shows `seed_commit`, revealed `seed`, entrant list, and recomputes the order on-device to confirm.

Admin app: enable/configure per zone, view/post today's code, live monitor, logged overrides.
Mockup of screens 1–3: `~/Downloads/LoadQ-Raffle-Mockup.png`.

---

## 12. Edge cases

- **0 entrants** → empty round, no line; admin may manual-post.
- **1 entrant** → gets #1.
- **Driver already queued elsewhere** → cross-zone active entry cleared on draw insert.
- **Checks in then leaves (no-show)** → existing depart/heal releases the slot post-draw.
- **Poor GPS / spoof** → rejected (accuracy threshold; both factors).
- **Duplicate device** → flagged/blocked per config.
- **Server misses the 6:01 tick** → draw job retries next minute; check-ins already closed at cutoff; draw is idempotent.
- **DST / timezone** → `draw_at` computed from local time + `timezone` each day.
- **Key tie** → break by `driver_id` (sha256 collision is effectively impossible).

---

## 13. Rollout plan

1. **Backend, disabled** — ship tables + RPCs + cron with every config `enabled=false`; test on a throwaway zone.
2. **App screens** — check-in, spin/board, verify; admin config + code view.
3. **Pilot at Universal Grocery** — run the raffle **in parallel** with the handwritten sheet for a few mornings; compare, tune geofence/accuracy/code flow.
4. **Cut over** — raffle becomes the source of the UG morning line; manual post retained as fallback/override.
5. **Expand** — enable per zone as desired (Berri, Namur, Laval, …) by adding config rows.

---

## 14. Open decisions (need Thomas)

- **Geofence** center lat/lng + radius for the Universal Grocery lot (140 George St) — and `max_gps_accuracy_m`.
- **Check-in opens at** — 05:45 assumed; confirm.
- **Code rotation** — daily vs new each round; and who posts it on-site (which admin pulls `loadq_raffle_code`).
- **Device-dedupe** — hard block or just flag when one device enters multiple drivers.
- **Eligibility** — verified + non-blocked + active vehicle assumed; include subscription-current?
- **No-show release window** — reuse the existing load-window timeout, or a tighter one for raffle slots?
```
