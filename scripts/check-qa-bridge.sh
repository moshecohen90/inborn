#!/usr/bin/env bash
# Release gate: a shipping bundle contains no QA bridge (apps/mobile/src/qa). The bridge presses any testID from
# inside the JS runtime, so it must exist only in builds made with EXPO_PUBLIC_QA=1 (metro.config.js swaps the
# entry file for a stub otherwise). This is the iOS/Android counterpart of check-android-permissions.sh.
#
# Usage: scripts/check-qa-bridge.sh <main.jsbundle | Inborn.app | *.xcarchive | *.ipa | *.apk>
#        scripts/check-qa-bridge.sh --expect-present <bundle>   # the QA build's own bundle: fails if it is absent
set -euo pipefail

SENTINEL="INBORN_QA_BRIDGE_V1"
expect_present=0
if [ "${1:-}" = "--expect-present" ]; then expect_present=1; shift; fi
target="${1:-}"
[ -e "$target" ] || { echo "usage: $0 [--expect-present] <main.jsbundle|app|xcarchive|ipa|apk>"; exit 2; }

work=""
cleanup() { [ -n "$work" ] && rm -rf "$work"; return 0; }
trap cleanup EXIT

case "$target" in
  *.ipa|*.apk|*.aab)
    work="$(mktemp -d)"
    unzip -q -o "$target" -d "$work"
    scan="$work" ;;
  *)
    scan="$target" ;;
esac

# The bundle is one line of minified JS, so grep -c would count lines, not hits; -o counts occurrences.
hits="$( { grep -rIoa "$SENTINEL" "$scan" 2>/dev/null || true; } | wc -l | tr -d ' ')"

if [ "$expect_present" = "1" ]; then
  [ "$hits" -gt 0 ] || { echo "FAIL: $target carries no $SENTINEL — this build cannot be driven by scripts/ios-qa.mjs"; exit 1; }
  echo "OK: $target is a QA build ($hits × $SENTINEL)"
  exit 0
fi

if [ "$hits" -gt 0 ]; then
  echo "FAIL: $target contains the QA bridge ($hits × $SENTINEL). It was built with EXPO_PUBLIC_QA=1; rebuild without it."
  grep -rIla "$SENTINEL" "$scan" 2>/dev/null | sed 's/^/  /'
  exit 1
fi
echo "OK: $target contains no QA bridge"
