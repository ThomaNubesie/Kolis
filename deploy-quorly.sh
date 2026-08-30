#!/usr/bin/env bash
# One-command production deploy for quorly.ca.
#
# Quorly is served by its OWN Netlify site (quorly-app), NOT by kolis-business.
# They are separate sites that happen to be built from the same admin-web
# codebase; deploy-prod.sh publishes business.kolis.ca and does not touch
# quorly.ca, so shipping a Quorly change needs THIS script as well.
#
#   ./deploy-quorly.sh
#
# Auth: uses $NETLIFY_AUTH_TOKEN if set, else the token saved by `netlify login`.
set -euo pipefail
cd "$(dirname "$0")"

SITE_ID="5779f471-a3cc-4109-ba8a-d236a08ce9e3"   # quorly-app → quorly.ca

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

# netlify-cli@latest, NOT @17: the pinned v17 bundles the current
# @netlify/plugin-nextjs into a function that returns nothing at runtime
# ("error decoding lambda response: invalid status code returned from lambda: 0",
# every SSR route 502). Verified on 2026-08-28 — v17 broke, latest worked.
#
# --skip-functions-cache: every page here, static ones included, is served by the
# Next runtime FUNCTION. Netlify reuses that function from cache by default,
# which silently ships a build with no new routes: existing pages keep working
# while anything added since the cached build 404s.
echo "Building + deploying admin-web to production (quorly.ca)…"
npx --yes netlify-cli@latest deploy --prod --build --skip-functions-cache --site "$SITE_ID"

# The CLI exits 0 even when the publish shipped zero functions and every route
# 502s, so its success is not evidence. Check the live site, and roll back to the
# last deploy that actually answers if it is down. See verify-deploy.sh.
./verify-deploy.sh "$SITE_ID" "https://quorly.ca" / /forms /pricing
