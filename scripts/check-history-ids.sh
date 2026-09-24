#!/usr/bin/env bash
# Lead-run gate: no personal device identifier or App Store Connect key id is readable anywhere in the git HISTORY
# of a branch — not only at HEAD, which is what packages/core/test/no-device-ids.test.ts already guards.
#
# The repo is public (moshecohen90/inborn) and a commit's patch is served to anyone by raw.githubusercontent.com,
# so a placeholder at HEAD hides nothing. This is deliberately NOT part of `pnpm check:store`: it is red on today's
# history and stays red until that history is rewritten, which only the lead does. Wire it into check:store after.
#
#   scripts/check-history-ids.sh                     # every commit reachable from HEAD
#   scripts/check-history-ids.sh origin/main..HEAD   # only what this branch adds
#   scripts/check-history-ids.sh --all               # every ref, which is what a push exposes
set -uo pipefail

cd "$(dirname "$0")/.."

# Assembled from fragments, and as patterns rather than the values, so this file cannot trip the HEAD guard on itself.
U1=00008110; S1=9867; A1=H2SHY
UDID_RE="${U1}-[0-9A-Fa-f]{16}"
SERIAL_RE="(^|[^0-9a-z])${S1}[0-9a-f]{4}([^0-9a-z]|$)"
ASC_RE="(^|[^A-Z0-9])${A1}[A-Z0-9]{5}([^A-Z0-9]|$)"

range="${1:-HEAD}"
if [ "$range" = "--all" ]; then log_args=(--all); else log_args=("$range"); fi

found=0
for pair in "iPhone UDID|$UDID_RE" "OnePlus 6T serial|$SERIAL_RE" "ASC key id|$ASC_RE"; do
  label="${pair%%|*}"
  re="${pair#*|}"
  # -G matches a regex against the patch text, so a commit that added OR removed the identifier is listed.
  hits="$(git log "${log_args[@]}" --extended-regexp --format='%H %ad %s' --date=short -G"$re" 2>/dev/null)"
  count="$(printf '%s' "$hits" | grep -c . || true)"
  if [ "$count" -gt 0 ]; then
    found=$((found + count))
    echo "FAIL: $label is in the patch of $count commit(s):"
    printf '%s\n' "$hits" | head -10 | sed 's/^/  /'
    [ "$count" -gt 10 ] && echo "  … and $((count - 10)) more"
  else
    echo "OK: $label is in no commit patch"
  fi
done

if [ "$found" -gt 0 ]; then
  echo
  echo "The public history still serves these. Rewriting it (git filter-repo over the three patterns, force-push main"
  echo "and every branch) is the fix; the original stays in the private archive repo. Until then this gate is red."
  exit 1
fi
echo
echo "PASS: no personal identifier in the history of ${range}"
