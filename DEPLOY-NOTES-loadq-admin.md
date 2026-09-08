# admin.loadq.ca — how it is built and deployed (updated 2026-09-08)

**admin.loadq.ca is served by the KOLIS repo, from `admin-web/`.** Netlify site
`loadq-admin`, id `74c65dc0-8ee8-4884-a688-eb42d5eb3ea5`. Not git-connected — deploys are
manual.

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

## Still open

- The **incident register** (`loadq-incident-register` branch, commit `a901826`,
  `admin-web/app/sheet/incident/`) has not been merged. It can now be taken into the Kolis
  admin-web safely — `/board` will no longer be lost by doing so.
- loadq.ca Android links were pointing at an expired Play **internal-test** URL; fixed on
  8 Sept (18 occurrences across 6 files) to the public listing.
