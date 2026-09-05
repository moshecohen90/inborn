#!/usr/bin/env bash
# Verifies a built Inborn.app: hardened runtime on, entitlements empty, and (with --notarized) a stapled ticket
# that Gatekeeper accepts. Ad-hoc local builds pass without --notarized.
set -euo pipefail
APP="${1:?usage: verify-macos.sh <Inborn.app> [--notarized]}"
MODE="${2:-}"

flags=$(codesign -d --verbose=2 "$APP" 2>&1 | sed -n 's/^CodeDirectory .*flags=\([^ ]*\).*/\1/p')
case "$flags" in
  *runtime*) echo "OK: hardened runtime ($flags)";;
  *) echo "FAIL: hardened runtime flag missing ($flags)"; exit 1;;
esac

ents=$(codesign -d --entitlements :- "$APP" 2>/dev/null | grep -c '<key>' || true)
if [ "${ents:-0}" != "0" ]; then
  echo "FAIL: entitlements must stay empty for the Developer ID build (found $ents keys)"; exit 1
fi
echo "OK: no entitlements"

codesign --verify --deep --strict "$APP" && echo "OK: signature verifies"

if [ "$MODE" = "--notarized" ]; then
  xcrun stapler validate "$APP" && echo "OK: notarization ticket stapled"
  spctl --assess --type execute --verbose=2 "$APP" && echo "OK: Gatekeeper accepts"
  dmg=$(ls "$(dirname "$APP")/../dmg/"*.dmg 2>/dev/null | head -1 || true)
  if [ -n "$dmg" ]; then
    xcrun stapler validate "$dmg" && echo "OK: DMG ticket stapled"
  fi
fi
