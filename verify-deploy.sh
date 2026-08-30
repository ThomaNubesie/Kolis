#!/usr/bin/env bash
# Post-deploy health check, with automatic rollback to the last good deploy.
#
# Why this exists: `netlify deploy --prod --build` prints "Deploy is live!" and
# exits 0 even when the publish uploaded ZERO functions. Every page here is served
# by the Next runtime function, so a zero-function publish 502s the entire site —
# `ENOENT: no such file or directory, open '/run-config.json'` on every route —
# while the CLI reports success. Seen twice on quorly-app on 2026-08-30, both times
# with a perfectly healthy build deploy sitting one row above the broken publish.
#
# So: probe production; if it is down, walk the deploy list newest-first, find one
# whose own unique URL answers 200, and restore it.
#
#   ./verify-deploy.sh <site_id> <base_url> [path ...]
#
# Needs NETLIFY_AUTH_TOKEN in the environment (the deploy scripts export it).
# Exit 0 = production is healthy. Exit 1 = still broken, or healthy only because
# it was rolled back to something older than what you just shipped — either way,
# look at it.
set -euo pipefail

SITE_ID="${1:?site id required}"
BASE="${2:?base url required}"
shift 2
PATHS=("${@:-/}")

: "${NETLIFY_AUTH_TOKEN:?NETLIFY_AUTH_TOKEN not set}"
API="https://api.netlify.com/api/v1"
auth=(-H "Authorization: Bearer $NETLIFY_AUTH_TOKEN")

code() {             # HTTP status, or 000 when the request never landed
  local c
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$1" 2>/dev/null)" || c=""
  echo "${c:-000}"
}

healthy() {          # healthy <base> — every path must answer 200
  local base="$1" p c
  for p in "${PATHS[@]}"; do
    c="$(code "$base$p")"
    [ "$c" = "200" ] || { echo "   $base$p -> $c" >&2; return 1; }
  done
  return 0
}

echo "Verifying $BASE …"
# A fresh publish needs a moment to propagate; don't cry rollback on the first miss.
for attempt in 1 2 3 4 5 6; do
  if healthy "$BASE"; then
    echo "✅ $BASE is healthy (${PATHS[*]} all 200)."
    exit 0
  fi
  [ "$attempt" -lt 6 ] && { echo "   not healthy yet — retry $attempt/5 in 10s"; sleep 10; }
done

echo "❌ $BASE is DOWN after the deploy. Looking for the last good deploy…" >&2

SITE_NAME="$(curl -s "${auth[@]}" "$API/sites/$SITE_ID" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("name",""))')"
[ -n "$SITE_NAME" ] || { echo "Could not resolve the site name — restore by hand." >&2; exit 1; }

# id, state and title, newest first. The title is the commit subject, which is how
# you can tell whether a rollback cost you the deploy you just made.
CANDIDATES="$(curl -s "${auth[@]}" "$API/sites/$SITE_ID/deploys?per_page=15" | python3 -c '
import sys, json
for d in json.load(sys.stdin):
    if d.get("state") == "ready":
        print("\t".join([d["id"], (d.get("title") or "(no title)").replace("\t", " ")]))
')"

PROBE_PATH="${PATHS[0]}"
while IFS=$'\t' read -r id title; do
  [ -n "$id" ] || continue
  c="$(code "https://$id--$SITE_NAME.netlify.app$PROBE_PATH")"
  echo "   $id  $c  $title" >&2
  if [ "$c" = "200" ]; then
    echo "↩️  Restoring $id — $title" >&2
    # VERIFY_DRY_RUN=1 exercises everything except the publish, so this path can be
    # rehearsed against a live site without moving production.
    if [ "${VERIFY_DRY_RUN:-}" = "1" ]; then
      echo "(dry run) would POST $API/sites/$SITE_ID/deploys/$id/restore"
      exit 0
    fi
    curl -s -X POST "${auth[@]}" "$API/sites/$SITE_ID/deploys/$id/restore" > /dev/null
    sleep 8
    if healthy "$BASE"; then
      echo "✅ $BASE restored and healthy — running: $title"
      # Loud if the rescue shipped something other than what is checked out here.
      HEAD_SUBJECT="$(git -C "$(dirname "$0")" log -1 --pretty=%s 2>/dev/null || true)"
      if [ -n "$HEAD_SUBJECT" ] && [ "$title" != "$HEAD_SUBJECT" ]; then
        echo "⚠️  This is NOT your latest commit — production is running an older deploy." >&2
        echo "    restored: $title" >&2
        echo "    HEAD:     $HEAD_SUBJECT" >&2
        exit 1
      fi
      exit 0
    fi
    echo "Restore did not bring it back." >&2
    exit 1
  fi
done <<< "$CANDIDATES"

echo "No healthy deploy found in the last 15. Restore by hand from the Netlify dashboard." >&2
exit 1
