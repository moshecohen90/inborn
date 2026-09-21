#!/usr/bin/env bash
# Release gate: the bundle carries the Tesseract OCR data and nothing from the iOS side of INBORN_MODELS_DIR/ocr.
# vc9 shipped with zero traineddata entries because the staging task never ran (round 17).
# Usage: scripts/check-android-bundle.sh <app.aab>
set -euo pipefail
f="${1:-}"; [ -f "$f" ] || { echo "usage: $0 <app.aab>"; exit 2; }
list="$(unzip -l "$f")"

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

ios="$(grep -cE "[[:space:]]base/assets/ios/" <<<"$list" || true)"
if [ "$ios" -gt 0 ]; then
  echo "FAIL: $ios entries under base/assets/ios — the iOS tesseract xcframework rode in as Android assets."; fail=1
else
  echo "OK: no base/assets/ios entries."
fi

[ "$fail" = 0 ] || exit 1
echo "OK: bundle carries both OCR language files and no iOS assets."
