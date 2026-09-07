# iMac deploy notes — LoadQ incident register → admin.loadq.ca (2026-09-07)

Left by the laptop session. Context: the **incident register** ("Registre d'incident",
tablet `/sheet/incident`) needs to go live on **admin.loadq.ca** (Netlify site
`loadq-admin`, id `74c65dc0-8ee8-4884-a688-eb42d5eb3ea5`). Its **database backend is already
live** (tables `loadq_incidents/_media/_recipient/_send`, the `loadq_incident_*` RPCs, and the
`loadq-incident-send` edge fn are all deployed on `kzjptcpjpwlxfofzhyku`).

## Why the laptop could NOT do it
- `admin.loadq.ca` serves `/board/{zone_id}` (the PNGs the Facebook auto-posts use). **That
  `/board` route exists only in this iMac's local, unpushed code** — it is in NO git branch and
  not on the laptop. Deploying the plain Kolis repo to `loadq-admin` from the laptop dropped
  `/board` and 404'd the whole site (it was rolled back). **Do NOT deploy the plain Kolis repo
  to loadq-admin — it wipes /board and breaks the FB boards.**
- The incident-register commit had been dropped from `ship-kolis-1.1.0` (divergent history). It
  is recovered and pushed as branch **`loadq-incident-register`** (commit `a901826`): it contains
  `admin-web/app/sheet/incident/page.tsx` and the incident-tab `admin-web/app/sheet/page.tsx`.

## To ship it (on THIS iMac, which HAS /board)
```bash
cd ~/…/Kolis            # the working copy that builds admin.loadq.ca (has app/board)
git fetch origin
# bring in ONLY the incident register, keeping your /board and everything else:
git checkout origin/loadq-incident-register -- admin-web/app/sheet/incident
# if your /sheet page doesn't yet link the "Registre d'incident" tab, also take its sheet page:
#   git checkout origin/loadq-incident-register -- admin-web/app/sheet/page.tsx   (review the diff first)
# build + deploy admin.loadq.ca the way you already do (that build keeps /board):
#   e.g. netlify deploy --build --prod --site 74c65dc0-8ee8-4884-a688-eb42d5eb3ea5
```
Verify after: `curl -sI https://admin.loadq.ca/board/ottawa-universal-grocery` (must be 200
image/png) and `https://admin.loadq.ca/sheet/incident` (should be 200).

## PLEASE push /board to GitHub
The `/board` route living only on this iMac is fragile (a laptop deploy already broke the site
once). Please commit + push the loadq-admin source (with `app/board`) to a branch so either
machine can build admin.loadq.ca safely. Then the laptop can do future deploys too.

See memory notes: loadq-incident-register, loadq-fb-board-autopost.
