#!/usr/bin/env bash
# One-command production deploy for business.kolis.ca.
# The Netlify site (kolis-business) is NOT connected to GitHub, so merges do not
# auto-deploy — run this to build admin-web and publish to production.
#
#   ./deploy-prod.sh
#
# Auth: uses $NETLIFY_AUTH_TOKEN if set, else the token saved by `netlify login`
# in the local Netlify CLI config. Never hardcodes the token.
set -euo pipefail
cd "$(dirname "$0")"

SITE_ID="da1cce8c-6a5b-4428-b46c-5267c0abc2a2"   # kolis-business

if [ -z "${NETLIFY_AUTH_TOKEN:-}" ]; then
  NETLIFY_AUTH_TOKEN="$(python3 - <<'PY'
import json, os
cfg = os.path.expanduser('~/Library/Preferences/netlify/config.json')
try:
    d = json.load(open(cfg))
    print(next((i['auth']['token'] for i in d.get('users', {}).values()
                if (i.get('auth') or {}).get('token')), ''))
except Exception:
    print('')
PY
)"
fi
if [ -z "$NETLIFY_AUTH_TOKEN" ]; then
  echo "No Netlify token. Run 'netlify login' or set NETLIFY_AUTH_TOKEN." >&2
  exit 1
fi
export NETLIFY_AUTH_TOKEN

echo "Building + deploying admin-web to production (business.kolis.ca)…"
# netlify-cli@latest, NOT @17: the pinned v17 bundles the current
# @netlify/plugin-nextjs into a function that returns nothing at runtime
# ("error decoding lambda response: invalid status code returned from lambda: 0",
# every SSR route 502). Verified on 2026-08-28 — v17 broke, latest worked.
#
# This deploys business.kolis.ca ONLY. quorly.ca is a separate Netlify site
# (quorly-app) — use ./deploy-quorly.sh for it.
#
# --skip-functions-cache: this is a Next.js app, so every page — including the
# static ones — is served by the Next runtime FUNCTION, not by uploaded HTML.
# Netlify reuses that function from cache by default, which silently ships a
# build with no new routes in it: existing pages keep working while anything
# added since the cached build 404s. Cost is ~30s of extra build; the
# alternative is a green deploy that is quietly missing pages.
npx --yes netlify-cli@latest deploy --prod --build --skip-functions-cache --site "$SITE_ID"

# The CLI exits 0 even when the publish shipped zero functions and every route
# 502s, so its success is not evidence. Check the live site, and roll back to the
# last deploy that actually answers if it is down. See verify-deploy.sh.
./verify-deploy.sh "$SITE_ID" "https://business.kolis.ca" / /forms
