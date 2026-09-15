# admin.loadq.ca — how it is built and deployed (updated 2026-09-14)

**admin.loadq.ca is served by the KOLIS repo, from `admin-web/`.** Netlify site
`loadq-admin`, id `74c65dc0-8ee8-4884-a688-eb42d5eb3ea5`. Not git-connected — deploys are
manual.

> ## ⚠️ `./deploy-prod.sh` DOES NOT DEPLOY THIS SITE
>
> It deploys **kolis-business** (`da1cce8c-…`, business.kolis.ca + admin.kolis.ca), a
> different Netlify site that happens to build the same `admin-web/`. On 2026-09-14 the
> `/sheet` seat-and-payment work was "deployed" six times with `deploy-prod.sh` before anyone
> noticed it had been going to the wrong domain the entire time.
>
> | Domain | Site | id | Deployed by |
> |---|---|---|---|
> | **admin.loadq.ca** | loadq-admin | `74c65dc0-…` | **the command below, from `admin-web/`** |
> | business.kolis.ca, admin.kolis.ca | kolis-business | `da1cce8c-…` | `./deploy-prod.sh` |
> | quorly.ca | quorly-app | `5779f471-…` | `./deploy-quorly.sh` |
> | business.loadq.ca | loadq-business | `836492f9-…` | nothing — stale since 2026-07-07 |
>
> Only quorly-app is GitHub-linked (so it alone has `base`/`dir` build settings in the UI).
> loadq-admin and kolis-business are unlinked and depend entirely on how the CLI is invoked,
> which is why the trap below bites them and not quorly.ca.

This corrects the earlier note, which said `/board` lived only on the iMac and in no branch.
That was wrong in a way that mattered: `/board` *was* pushed, but to the **LoadQ** repo
(`ship-loadq-1.2.6`, `admin-web/app/board/[zone]/route.tsx`). Two repos each held half the
site, and admin.loadq.ca can only serve one build — so whichever was deployed last silently
deleted the other half.

That is exactly what happened, twice:

- deploying **Kolis** wiped `/board` (the Facebook auto-post images 404'd), and
- deploying **LoadQ** wiped `/sheet` (the tablet 404'd for several hours on 8 Sept).

## Fixed by merging, not by choosing

`/board` now lives in the Kolis repo next to `/sheet`. Both routes are in one build, so there
is nothing left to overwrite:

| Path | What |
|---|---|
| `admin-web/app/sheet/` | the tablet — list writer's console |
| `admin-web/app/board/[zone]/route.tsx` | live board PNG, used by the Facebook posts |
| `admin-web/lib/carSlugs.ts` | manifest of pre-sized vehicle images |
| `admin-web/public/cars/*.png` | 87 vehicle images (1 per make/model/colour) |
| `admin-web/scripts/fetch_cars.py` | regenerates the above when vehicles are added |

This works because **Kolis and LoadQ share the Supabase project** `kzjptcpjpwlxfofzhyku`, so
`NEXT_PUBLIC_SUPABASE_URL` already points where the board needs.

`app/board/[zone]/route.tsx` still exists in the LoadQ repo. It is now a **stale copy** —
edit the Kolis one. Delete the LoadQ copy when convenient.

## To deploy

```bash
cd ~/…/Kolis/admin-web        # NOT the repo root — see the trap below
npm run build
npx netlify-cli deploy --prod --dir=.next --site=74c65dc0-8ee8-4884-a688-eb42d5eb3ea5
```

**The trap:** the Netlify CLI resolves `publish` from the *working directory*, not from the
`base` in `netlify.toml`. Run it from the repo root and it looks for `Kolis/.next`, which
does not exist, and the deploy fails. Run it from `admin-web/` and `publish = ".next"`
resolves correctly. (Netlify's own CI does honour `base`; only the local CLI differs.)

**The second trap, worse because it is silent (found 2026-09-14):** if you force past the
first one — e.g. by setting `publish = "admin-web/.next"` so a root-run build succeeds — the
CLI then detects the framework from the directory it runs in. The repo root is the **Expo**
app, so it ships a **436 KB stub handler** instead of the ~8 MB Next server bundle. The deploy
goes `ready`, the CLI exits 0, and every route 502s. Do not "fix" the publish path; fix the
working directory.

`netlify.toml`'s publish line has now been flipped three times between `.next` and
`admin-web/.next` (f3bbc75 set it, 24345bc reverted it, 2026-09-14 nearly again). **`.next` is
correct.** Leave it alone and run the CLI from `admin-web/`.

**Green is not evidence.** Confirm what actually shipped:

```bash
curl -s -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  "https://api.netlify.com/api/v1/sites/74c65dc0-8ee8-4884-a688-eb42d5eb3ea5/deploys?per_page=3" \
  | python3 -c "import json,sys
for d in json.load(sys.stdin):
    f=(d.get('available_functions') or [{}])[0]
    print(d['id'], d['state'], d.get('framework'), f.get('s'))"
```

A healthy admin-web deploy is `framework=next` with **1 function of ~7.8 MB**. `framework=expo`
(stub, 502s) or zero functions (404s) means it is broken no matter what the CLI said.

## Verify after every deploy — both, every time

```bash
curl -sI https://admin.loadq.ca/sheet                          # 200 text/html
curl -sI https://admin.loadq.ca/board/ottawa-universal-grocery # 200 image/png
```

A board PNG of ~25 KB is the **empty-state** image ("Aucune voiture en file") — correct when
no cars are queued. A populated board is 150–300 KB. Both are 200, so status alone does not
tell you the board is working; check the size.

## Other sites, so they are not confused again

| Site | Netlify id | Source |
|---|---|---|
| **admin.loadq.ca** | `74c65dc0-…` | **Kolis** repo, `admin-web/` |
| loadq.ca | `f54300ce-683f-4110-9d05-adc9db177189` | **LoadQ** repo, `site/` (static) |
| quorly.ca | quorly-app | Kolis repo, `admin-web/` (host-routed) |

## 2026-09-14: pin 26.2.0, and expect to retry

> **Corrected 2026-09-15.** The claim below — that 27.x is broken and 26.2.0 is safe — is too
> strong. **26.2.0 hit the same 403 the next day.** The extensions call fails *intermittently*
> on any version, and on 2026-09-15 it coincided with the account being **rate-limited**:
> `/api/v1/user` returned **429, x-ratelimit-remaining: 0** after a day of repeated deploys,
> which the CLI reports as the thoroughly misleading `Project not found. Please rerun
> "netlify link"`. The state.json was fine both times.
>
> So: still pin 26.2.0 (it has succeeded more often), but treat a failed deploy as **retry,
> not diagnose**. Check `/api/v1/user` first — a 429 means wait, not investigate:
>
> ```bash
> curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
>   https://api.netlify.com/api/v1/user     # 429 = rate-limited, wait for x-ratelimit-reset
> ```
>
> A failed `--prod` deploy does NOT publish, so production keeps serving the last good build
> while you retry. That is why the site stayed up through both incidents.

**`netlify-cli` 27.4.1 and 27.6.0 both failed here; 26.2.0 has worked more reliably.** The 27.x
versions die in the Next plugin's `onBuild` with:

```
Plugin "@netlify/plugin-nextjs" internal error
Error: Failed retrieving extensions for site 74c65dc0-…:
       Unexpected status code 403 from fetching extensions.
```

and ship a deploy with **zero functions**, which reports `ready` and then 404s every route.
26.2.0 runs the same "Installing extensions / Loading extensions" step against the same site
with the same token and does not 403. Use it:

```bash
cd ~/…/Kolis/admin-web        # NOT the repo root
npx --yes netlify-cli@26.2.0 deploy --build --skip-functions-cache \
  --site=74c65dc0-8ee8-4884-a688-eb42d5eb3ea5          # draft first, no --prod
# check the draft URL and the function size, THEN:
npx --yes netlify-cli@26.2.0 deploy --prod --build --skip-functions-cache \
  --site=74c65dc0-8ee8-4884-a688-eb42d5eb3ea5
```

Ruled out along the way, so nobody re-runs them:

- **Not auth identity** — `netlify status` is Derick Shalo / shaloderick, correct project.
- **Not team ownership** — loadq-admin, quorly-app and kolis-business all belong to
  `Balenton Automotive` (slug `shaloderick`), the one team this token has.
- **Not the Node version** — the "cannot be executed with Node.js 20.19.4" line is a
  *warning*; the plugin declares `node >=18`. (This machine has only Node 20.19.4, no nvm.)
- **Not the publish path** — run from `admin-web/`, the CLI reads the ROOT netlify.toml and
  resolves base and publish correctly. `admin-web/` needs no netlify.toml of its own.

**This cost an outage before it was understood:** a `--prod` deploy on 2026-09-14 took
admin.loadq.ca down for about three minutes — every route 404, including the tablet's `/sheet`
and the board PNG — and had to be restored by hand. Hence the rules below.

⚠️ `deploy-quorly.sh` still pins **27.4.1**. It last succeeded on 2026-09-13; if it now fails
the same way, this is why — but quorly-app is repo-linked and may behave differently, so it
has not been changed without testing.

### Rules that came out of this

1. **Never deploy straight to `--prod`.** Drop `--prod` for a draft deploy on its own URL,
   check it, and only then promote. Production paid for that lesson.
2. **Check the function count before trusting any deploy** (command above). `fn=0` → 404s,
   `framework=expo` → 502s. The CLI exits 0 for both.
3. **Restore is one call** — keep it to hand:

```bash
curl -X POST -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  "https://api.netlify.com/api/v1/sites/74c65dc0-8ee8-4884-a688-eb42d5eb3ea5/deploys/6aa6e6ac9e2cb99b2ba0a982/restore"
```

`6aa6e6ac9e2cb99b2ba0a982` (2026-09-13, framework=next, 1 function, 7.80 MB) is the last known
good deploy of admin.loadq.ca.

## Still open

- **kolis-business (business.kolis.ca) has been serving its 2026-09-01 build ever since**, and
  its local deploy path is currently broken: every attempt on 2026-09-14 shipped either an
  expo stub (502) or zero functions (404), and `verify-deploy.sh` rolled each one back. The
  site is healthy on the old build. It is a *separate* problem from admin.loadq.ca — fixing it
  probably means giving `deploy-prod.sh` the same "run from `admin-web/`" treatment as the
  command above, then verifying through the API rather than trusting the exit code.
- `deploy-prod.sh` still says `netlify-cli@latest`. That was fine on 2026-08-28 and is not
  now — `@latest` drifted to 27.6.0. `deploy-quorly.sh` pins **27.4.1**; deploy-prod.sh should
  too.

- The **incident register** (`loadq-incident-register` branch, commit `a901826`,
  `admin-web/app/sheet/incident/`) has not been merged. It can now be taken into the Kolis
  admin-web safely — `/board` will no longer be lost by doing so.
- loadq.ca Android links were pointing at an expired Play **internal-test** URL; fixed on
  8 Sept (18 occurrences across 6 files) to the public listing.
