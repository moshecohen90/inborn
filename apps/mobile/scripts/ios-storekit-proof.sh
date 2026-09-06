#!/usr/bin/env bash
# StoreKit Testing proof on the iOS simulator (spec §14.2 row 10): prebuild → add the XCUITest target + .storekit →
# build once → run the purchase/relaunch/refund/restore test with Metro serving the paywall, then re-serve the bundle
# with the store forced offline and prove the sealed cache alone grants Pro. No App Store Connect, no network.
#
#   SIM="iPhone 15" OUT=/path/for/screenshots apps/mobile/scripts/ios-storekit-proof.sh
#
# Leaves: $OUT/*.png, $OUT/*.xcresult, $OUT/summary.txt. Kills Metro and shuts the simulator it booted.
set -euo pipefail
cd "$(dirname "$0")/.."
SIM="${SIM:-iPhone 15}"
RUNTIME="${RUNTIME:-iOS 17.0}"
OUT="${OUT:-$PWD/../../.proof/storekit}"
mkdir -p "$OUT"
export APP_VARIANT=development

UDID=$(xcrun simctl list devices available -j | python3 -c "
import json,sys; d=json.load(sys.stdin)
for rt,devs in d['devices'].items():
    if '$RUNTIME'.replace(' ','-').replace('.','-') in rt:
        for x in devs:
            if x['name']=='$SIM': print(x['udid']); sys.exit()
")
[ -n "$UDID" ] || { echo "no simulator '$SIM' on $RUNTIME"; exit 1; }
BOOTED_BY_US=0
if ! xcrun simctl list devices | grep "$UDID" | grep -q Booted; then xcrun simctl boot "$UDID"; BOOTED_BY_US=1; fi
xcrun simctl bootstatus "$UDID" -b >/dev/null

npx expo prebuild -p ios --no-install >/dev/null
(cd ios && pod install >/dev/null)
SCHEME=$(basename ios/*.xcodeproj .xcodeproj)
ruby scripts/ios-add-storekit-tests.rb "ios/$SCHEME.xcodeproj" "$SCHEME"

echo "== build for testing"
xcodebuild build-for-testing -workspace "ios/$SCHEME.xcworkspace" -scheme "$SCHEME" -configuration Debug -sdk iphonesimulator \
  -destination "id=$UDID" -derivedDataPath ios/build/dd SWIFT_VERSION=5.0 CODE_SIGNING_ALLOWED=NO -quiet
XCTESTRUN=$(ls ios/build/dd/Build/Products/*.xctestrun | head -1)

start_metro() { # $1 = extra env
  env EXPO_PUBLIC_START_SCREEN=paywall $1 npx expo start --port 8081 --clear >"$OUT/metro-$2.log" 2>&1 &
  METRO=$!
  for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:8081/status" >/dev/null && break; sleep 1; done
}
stop_metro() { kill "$METRO" 2>/dev/null || true; wait "$METRO" 2>/dev/null || true; }

echo "== phase A: purchase / relaunch / refund / restore (store = local StoreKit Testing)"
start_metro "" a
xcodebuild test-without-building -xctestrun "$XCTESTRUN" -destination "id=$UDID" -resultBundlePath "$OUT/phaseA.xcresult" \
  -only-testing:InbornUITests/PaywallUITests/testPurchaseRelaunchRefundRestore TEST_RUNNER_INBORN_SHOTS="$OUT" 2>&1 | tee "$OUT/phaseA.log" | grep -E "Test Case|passed|failed|error:" || true
stop_metro

echo "== phase B: store forced offline, sealed cache only"
start_metro "EXPO_PUBLIC_STORE_OFFLINE=1" b
xcodebuild test-without-building -xctestrun "$XCTESTRUN" -destination "id=$UDID" -resultBundlePath "$OUT/phaseB.xcresult" \
  -only-testing:InbornUITests/PaywallUITests/testOfflineCacheGrantsPro TEST_RUNNER_INBORN_SHOTS="$OUT" 2>&1 | tee "$OUT/phaseB.log" | grep -E "Test Case|passed|failed|error:" || true
stop_metro

{ echo "phase A:"; grep -E "Test Case.*(passed|failed)" "$OUT/phaseA.log"; echo "phase B:"; grep -E "Test Case.*(passed|failed)" "$OUT/phaseB.log"; ls "$OUT"/*.png; } | tee "$OUT/summary.txt"
[ "$BOOTED_BY_US" = 1 ] && xcrun simctl shutdown "$UDID" || true
