#!/usr/bin/env bash
# Release gate: the bundle carries the Tesseract OCR data, nothing from the iOS side of INBORN_MODELS_DIR/ocr,
# and every asset pack a store build must deliver.
# vc9 shipped with zero traineddata entries because the staging task never ran (round 17); vc8..vc11 shipped
# with an INBORN_PACKS subset, so Sharp, speech and vision were unreachable on a Play install.
# Usage: scripts/check-android-bundle.sh <app.aab>
set -euo pipefail
f="${1:-}"; [ -f "$f" ] || { echo "usage: $0 <app.aab>"; exit 2; }
list="$(unzip -l "$f")"
config="$(dirname "$0")/../apps/mobile/app.config.ts"
[ -f "$config" ] || { echo "FAIL: cannot read $config to learn the pack list."; exit 2; }
# The expected packs are read out of ALL_PACKS so a new pack cannot be added to the app without this gate seeing it.
packs="$(sed -n '/^const ALL_PACKS = {/,/^} as const;/p' "$config" | grep -oE 'name: "[a-z0-9_]+"' | cut -d'"' -f2)"
[ -n "$packs" ] || { echo "FAIL: found no pack names in ALL_PACKS of $config."; exit 2; }

fail=0
for lang in eng heb; do
  # A here-string, not a pipe: grep -q closes the pipe on its first match and pipefail would read the
  # producer's SIGPIPE as a failed check.
  if grep -qE "[[:space:]]base/assets/tessdata/${lang}\.traineddata$" <<<"$list"; then
    size="$(awk -v p="base/assets/tessdata/${lang}.traineddata" '$4==p{print $1}' <<<"$list")"
    echo "OK: base/assets/tessdata/${lang}.traineddata ($size B)"
  else
    echo "FAIL: base/assets/tessdata/${lang}.traineddata is missing; OCR reports ERR_NO_OCR on the device."; fail=1
  fi
done

for pack in $packs; do
  n="$(awk -v p="$pack/" 'index($4, p) == 1 {n++; s+=$1} END {print n+0" "s+0}' <<<"$list")"
  read -r entries bytes <<<"$n"
  if [ "$entries" -gt 0 ]; then
    echo "OK: asset pack $pack ($entries entries, $bytes B)"
  else
    echo "FAIL: asset pack $pack is missing; a store bundle is built with INBORN_PACKS unset."; fail=1
  fi
done

ios="$(grep -cE "[[:space:]]base/assets/ios/" <<<"$list" || true)"
if [ "$ios" -gt 0 ]; then
  echo "FAIL: $ios entries under base/assets/ios — the iOS tesseract xcframework rode in as Android assets."; fail=1
else
  echo "OK: no base/assets/ios entries."
fi

[ "$fail" = 0 ] || exit 1
echo "OK: bundle carries both OCR language files, every asset pack of ALL_PACKS and no iOS assets."
