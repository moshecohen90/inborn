#!/usr/bin/env bash
# Thermal + battery trace of an installed Inborn build while it generates long answers (spec §6.5 report).
# Read-only on the device: launches the app, types prompts through `input`, samples dumpsys. Nothing is installed.
#   scripts/device-thermal-measure.sh <adb-serial> [seconds=180] [out.csv]
set -euo pipefail
SERIAL=${1:?adb serial}; SECS=${2:-180}; OUT=${3:-device-thermal-$SERIAL.csv}
PKG=com.inbornapp.mobile
A(){ adb -s "$SERIAL" "$@"; }
PROMPT='Write%sa%svery%slong%sand%sdetailed%sessay%sabout%sthe%shistory%sof%sthe%sRoman%sEmpire,%sat%sleast%s1500%swords.'
A shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep 3
# Center of the node with this testID (resource-id in the uiautomator dump), "" when absent.
center(){ A exec-out uiautomator dump /dev/tty 2>/dev/null | grep -o "resource-id=\"$1\"[^>]*bounds=\"[^\"]*\"" | head -1 | grep -o 'bounds="[^"]*"' | awk -F'[][,]+' '{print int(($2+$4)/2), int(($3+$5)/2)}'; }
# Keyboard-driven: injected taps were swallowed on the shared OnePlus, key events were not. Tab focuses the composer, Enter submits.
send(){
  [ -n "$(center stop)" ] && { echo "still answering, prompt skipped"; return; }
  [ -z "$(center composer-input)" ] && { read -r x y < <(center new-chat) || :; [ -n "$x" ] && A shell input tap $x $y; sleep 2; }
  focused(){ A exec-out uiautomator dump /dev/tty 2>/dev/null | grep -q 'resource-id="composer-input"[^>]*focused="true"'; }
  for _ in 1 2 3 4; do focused && break; A shell input keyevent TAB; sleep 1; done
  focused || { echo "composer not focused"; return; }
  A shell input text "$PROMPT"; sleep 1; A shell input keyevent 66; echo "prompt sent"
}
echo "t_s,thermal_status,skin_c,skin_status,battery_c,cpu_max_c,battery_pct,current_ua,plugged" > "$OUT"
START=$(date +%s); NEXT=0
while :; do
  T=$(( $(date +%s) - START )); [ $T -ge $SECS ] && break
  if [ $T -ge $NEXT ]; then send; NEXT=$((T+80)); fi          # ~1,024 tokens at ~15 tok/s ≈ 70 s per answer
  TS=$(A shell dumpsys thermalservice)
  STATUS=$(grep -m1 -o 'Thermal Status: [0-9]*' <<<"$TS" | grep -o '[0-9]*$')
  HAL=$(sed -n '/Current temperatures from HAL/,$p' <<<"$TS")
  SKIN=$(grep -o 'mValue=[0-9.]*, mType=3' <<<"$HAL" | head -1 | grep -o '[0-9.]*' | head -1)
  SKINST=$(grep -o 'mType=3, mName=[a-z0-9_]*, mStatus=[0-9]*' <<<"$HAL" | head -1 | grep -o '[0-9]*$')
  BATT=$(grep -o 'mValue=[0-9.]*, mType=2' <<<"$HAL" | head -1 | grep -o '[0-9.]*' | head -1)
  CPU=$(grep -o 'mValue=[0-9.]*, mType=0' <<<"$HAL" | grep -o '[0-9.]*' | sort -n | tail -1)
  B=$(A shell dumpsys battery)
  PCT=$(grep -o 'level: [0-9]*' <<<"$B" | grep -o '[0-9]*'); CUR=$(grep -io 'current now: -\?[0-9]*' <<<"$B" | grep -o '\-\?[0-9]*$' || echo "")
  PLUG=$(grep -c 'powered: true' <<<"$B")
  echo "$T,$STATUS,$SKIN,$SKINST,$BATT,$CPU,$PCT,$CUR,$PLUG" | tee -a "$OUT"
  sleep 10
done
A exec-out screencap -p > "${OUT%.csv}.png" 2>/dev/null || true
echo "wrote $OUT"
