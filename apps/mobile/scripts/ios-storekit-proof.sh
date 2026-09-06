#!/usr/bin/env bash
# StoreKit Testing proof on the iOS simulator (spec §14.2 row 10): prebuild → add the XCUITest target + .storekit →
# build once → run the purchase/relaunch/refund/restore test with Metro serving the paywall, then re-serve the bundle
# with the store forced offline and prove the sealed cache alone grants Pro. No App Store Connect, no network.
#
#   SIM="iPhone 15" OUT=/path/for/screenshots apps/mobile/scripts/ios-storekit-proof.sh
#
# Metro runs on $METRO_PORT (default 8091, so another Metro on 8081 is left alone) and the simulator app is pointed at it
# through the RCT_jsLocation user default. The test opens the app's `inborn://paywall` deep link after launch.
# Leaves: $OUT/*.png, $OUT/*.xcresult, $OUT/summary.txt. Kills Metro and shuts the simulator it booted.
set -euo pipefail
cd "$(dirname "$0")/.."
SIM="${SIM:-iPhone 15}"
RUNTIME="${RUNTIME:-iOS 17.0}"
OUT="${OUT:-$PWD/../../.proof/storekit}"
METRO_PORT="${METRO_PORT:-8091}"
TEAM="${DEVELOPMENT_TEAM:-NGCHN95667}"
mkdir -p "$OUT"
export APP_VARIANT=development DEVELOPMENT_TEAM="$TEAM"

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
# Signed with the team so the simulator Keychain (expo-secure-store) has its application-identifier entitlement.
xcodebuild build-for-testing -workspace "ios/$SCHEME.xcworkspace" -scheme "$SCHEME" -configuration Debug -sdk iphonesimulator \
  -destination "id=$UDID" -derivedDataPath ios/build/dd SWIFT_VERSION=5.0 DEVELOPMENT_TEAM="$TEAM" -quiet
xcrun simctl spawn "$UDID" defaults write com.inbornapp.mobile RCT_jsLocation "127.0.0.1:$METRO_PORT"
XCTESTRUN=$(ls ios/build/dd/Build/Products/*.xctestrun | head -1)

start_metro() { # $1 = extra env
  env CI=1 $1 npx expo start --port "$METRO_PORT" --clear >"$OUT/metro-$2.log" 2>&1 &
  METRO=$!
  for _ in $(seq 1 90); do curl -sf "http://127.0.0.1:$METRO_PORT/status" >/dev/null && break; sleep 1; done
}
stop_metro() { kill "$METRO" 2>/dev/null || true; wait "$METRO" 2>/dev/null || true; }

echo "== phase A: purchase / relaunch / refund / restore (store = local StoreKit Testing)"
start_metro "EXPO_PUBLIC_STORE_OFFLINE=0" a
xcodebuild test-without-building -xctestrun "$XCTESTRUN" -destination "id=$UDID" -resultBundlePath "$OUT/phaseA.xcresult" \
  -only-testing:InbornUITests/PaywallUITests/testPurchaseRelaunchRefundRestore TEST_RUNNER_INBORN_SHOTS="$OUT" 2>&1 | tee "$OUT/phaseA.log" | grep -E "Test Case|passed|failed|error:" || true
stop_metro

echo "== phase B: store forced offline, sealed cache only"
start_metro "EXPO_PUBLIC_STORE_OFFLINE=1" b
xcodebuild test-without-building -xctestrun "$XCTESTRUN" -destination "id=$UDID" -resultBundlePath "$OUT/phaseB.xcresult" \
  -only-testing:InbornUITests/PaywallUITests/testOfflineCacheGrantsPro TEST_RUNNER_INBORN_SHOTS="$OUT" 2>&1 | tee "$OUT/phaseB.log" | grep -E "Test Case|passed|failed|error:" || true
stop_metro

# Screenshots are XCTest attachments; export them by their names.
for ph in A B; do
  rm -rf "$OUT/att$ph"; xcrun xcresulttool export attachments --path "$OUT/phase$ph.xcresult" --output-path "$OUT/att$ph" >/dev/null 2>&1 || true
  python3 - "$OUT/att$ph" "$OUT" <<'PY'
import json, os, shutil, sys
src, out = sys.argv[1:3]
try:
    for t in json.load(open(os.path.join(src, "manifest.json"))):
        for a in t.get("attachments", []):
            n, f = a.get("suggestedHumanReadableName", ""), a.get("exportedFileName", "")
            if n.endswith(".png") and f: shutil.copy(os.path.join(src, f), os.path.join(out, n.split("_0_")[0] + ".png"))
except FileNotFoundError:
    pass
PY
done
{ echo "phase A:"; grep -E "Test Case.*(passed|failed)" "$OUT/phaseA.log"; echo "phase B:"; grep -E "Test Case.*(passed|failed)" "$OUT/phaseB.log"; ls "$OUT"/*.png; } | tee "$OUT/summary.txt"
[ "$BOOTED_BY_US" = 1 ] && xcrun simctl shutdown "$UDID" || true
