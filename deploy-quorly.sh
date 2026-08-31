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

# PIN the CLI. Do not change this to @latest without testing the live site.
#
# 27.4.2 (published 2026-08-31) INLINES the Next runtime's modules into a single
# /var/task/___netlify-server-handler.mjs instead of leaving them under
# .netlify/dist/run/. The runtime computes its config path as
# resolve(MODULE_DIR, "../../..") — correct when the module sits three levels deep,
# but when it is inlined at the task root that resolves to "/", so every SSR route
# 502s with: ENOENT: no such file or directory, open '/run-config.json'.
# 27.4.1 packages it correctly (46-line handler + a separate .netlify/dist tree).
#
# Earlier note, still true: NOT @17 either — v17 bundled a function that returned
# nothing at runtime ("invalid status code returned from lambda: 0").
#
# --skip-functions-cache: every page here, static ones included, is served by the
# Next runtime FUNCTION. Netlify reuses that function from cache by default,
# which silently ships a build with no new routes: existing pages keep working
# while anything added since the cached build 404s.
NETLIFY_CLI_VERSION="${NETLIFY_CLI_VERSION:-27.4.1}"

# A stale .netlify tree is how a bad bundle survives a "fix": the CLI hashes what is
# already on disk, the CDN answers "I have that", and the broken function is quietly
# reused. Build the function bundle from scratch every time.
rm -rf admin-web/.netlify/functions admin-web/.netlify/functions-internal

echo "Building + deploying admin-web to production (quorly.ca) with netlify-cli@${NETLIFY_CLI_VERSION}…"
npx --yes "netlify-cli@${NETLIFY_CLI_VERSION}" deploy --prod --build --skip-functions-cache --site "$SITE_ID"

# The CLI exits 0 even when the publish shipped zero functions and every route
# 502s, so its success is not evidence. Check the live site, and roll back to the
# last deploy that actually answers if it is down. See verify-deploy.sh.
./verify-deploy.sh "$SITE_ID" "https://quorly.ca" / /forms /pricing
