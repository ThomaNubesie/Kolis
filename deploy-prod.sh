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

# PIN THE CLI to 26.2.0. Every 27.x tried on 2026-09-14 (27.4.1 and 27.6.0) fails the
# Next plugin's onBuild with "403 fetching extensions" and ships a deploy with ZERO
# functions — reports ready, then 404s every route. 26.2.0 runs the same extensions
# step against the same sites with the same token and succeeds; it is what put
# admin.loadq.ca live that day. "@latest" was correct on 2026-08-28 and is not now.
#
# NOT @17 either: v17 bundles a function that returns nothing at runtime
# ("invalid status code returned from lambda: 0").
#
# ⚠️ UNVERIFIED for THIS site: 26.2.0 is proven on loadq-admin, not yet on
# kolis-business, which has been serving its 2026-09-01 build. Deploy a draft first
# (drop --prod), check the function count, and only then promote. See
# DEPLOY-NOTES-loadq-admin.md.
NETLIFY_CLI_VERSION="${NETLIFY_CLI_VERSION:-26.2.0}"

# A stale .netlify tree is how a bad bundle survives a fix: the CLI hashes what is on
# disk, the CDN says "I have that", and the broken function is quietly reused. The 502
# above was served from exactly this.
rm -rf admin-web/.netlify/functions admin-web/.netlify/functions-internal

echo "Building + deploying admin-web to production (business.kolis.ca) with netlify-cli@${NETLIFY_CLI_VERSION}…"
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
# Run from admin-web, NOT the repo root. The CLI detects the framework from the
# directory it runs in, and the root is the Expo app — from there it ships a stub
# handler that 502s on every route. It still reads THIS repo's root netlify.toml and
# resolves base and publish correctly from here; admin-web needs no netlify.toml of
# its own (one was created while debugging and deliberately removed).
( cd admin-web && npx --yes "netlify-cli@${NETLIFY_CLI_VERSION}" deploy --prod --build --skip-functions-cache --site "$SITE_ID" )

# The CLI exits 0 even when the publish shipped zero functions and every route
# 502s, so its success is not evidence. Check the live site, and roll back to the
# last deploy that actually answers if it is down. See verify-deploy.sh.
./verify-deploy.sh "$SITE_ID" "https://business.kolis.ca" / /forms
