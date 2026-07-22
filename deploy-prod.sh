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
npx --yes netlify-cli@17 deploy --prod --build --site "$SITE_ID"
