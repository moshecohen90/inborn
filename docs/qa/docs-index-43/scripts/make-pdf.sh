#!/bin/zsh
# A 40-page PDF of public-domain text (The Federalist Papers, Project Gutenberg #1404) for the index measure.
set -e
out=${1:-/tmp/federalist-40.pdf}
tmp=$(mktemp -d)
curl -sS -o $tmp/pg1404.txt https://www.gutenberg.org/cache/epub/1404/pg1404.txt
python3 - $tmp <<'PY'
import sys
d = sys.argv[1]
s = open(f"{d}/pg1404.txt", encoding="utf-8-sig").read().replace("\r\n", "\n")
i = s.index("FEDERALIST No. 1")
open(f"{d}/body.txt", "w").write(s[i:i + 140000])
PY
cupsfilter -m application/pdf $tmp/body.txt > $out 2>/dev/null
pdfinfo $out | grep Pages
rm -rf $tmp
