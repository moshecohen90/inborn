#!/usr/bin/env bash
# Monthly trademark watch: lists live marks identical to NAME in classes 9/42 at EM/US/GB/WO (TMview search API).
# Usage: scripts/tm-watch.sh [NAME]   (default: Inborn). Exit 1 when a new identical live mark appears.
set -euo pipefail
NAME="${1:-Inborn}"; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
for i in 1 2 3; do
  code=$(curl -s -m 90 -A "$UA" -H "Content-Type: application/json" -H "Accept: application/json" -H "Origin: https://www.tmdn.org" -H "Referer: https://www.tmdn.org/tmview/" \
    -X POST "https://www.tmdn.org/tmview/api/search/results" --data "{\"page\":\"1\",\"pageSize\":\"100\",\"criteria\":\"C\",\"basicSearch\":\"$NAME\"}" -o "$tmp" -w "%{http_code}")
  [ "$code" = "200" ] && break; sleep $((i*20))
done
[ "$code" = "200" ] || { echo "TMview unavailable (HTTP $code); try again later"; exit 2; }
python3 - "$tmp" "$NAME" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); name=sys.argv[2].lower(); hits=[]
for t in d.get('tradeMarks') or []:
    nc=[int(x) for x in (t.get('niceClass') or []) if str(x).isdigit()]
    live=(t.get('tradeMarkStatus') or '').lower() not in ('ended','expired','withdrawn','refused','cancelled','surrendered','lapsed')
    if (t.get('tmName') or '').strip().lower()==name and (9 in nc or 42 in nc) and t.get('tmOffice') in ('EM','US','GB','WO') and live:
        hits.append(f"{t.get('tmName')} | {t.get('tmOffice')} | {nc} | {t.get('applicantName')} | app {(t.get('applicationDate') or '')[:10]} | reg {(t.get('registrationDate') or '')[:10]} | {t.get('tradeMarkStatus')}")
print(f"TMview: {d.get('totalResults')} results for '{sys.argv[2]}'; identical live marks in 9/42 at EM/US/GB/WO: {len(hits)}")
for h in hits: print("  !! "+h)
sys.exit(1 if hits else 0)
PY
