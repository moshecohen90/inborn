#!/usr/bin/env node
// Validates every Inborn store-listing JSON against the real store field limits.
// Exits non-zero on any overflow or rule violation. Run: node docs/store/scripts/check-store-copy.mjs
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STORE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const cp = (s) => [...s].length;                     // Unicode code points (store char count)
const bytes = (s) => Buffer.byteLength(s, 'utf8');   // UTF-8 bytes (Apple keyword field is 100 bytes)

// char limits. keywords is byte-limited and handled separately.
const LIMITS = {
  'apple.name': 30, 'apple.subtitle': 30, 'apple.promotional_text': 170,
  'apple.description': 4000, 'apple.whats_new': 4000,
  'google.title': 30, 'google.short_description': 80, 'google.full_description': 4000,
};
const KEYWORDS_BYTES = 100;
const SCREEN_HEADLINE_MAX = 45;  // thumbnail-readability guidance, not a hard store cap
const SCREEN_SUBLINE_MAX = 60;
const AB_SUBTITLE_MAX = 30;
const AB_SHORT_MAX = 80;

let errors = [], warns = [], rows = [];

function get(obj, path) { return path.split('.').reduce((o, k) => (o ?? {})[k], obj); }

function tokens(kwField) {
  // Apple tokenizes the keyword field on commas AND spaces.
  return kwField.split(',').flatMap((p) => p.trim().split(/\s+/)).filter(Boolean).map((t) => t.toLowerCase());
}

for (const file of readdirSync(STORE_DIR).filter((f) => /^listing\..+\.json$/.test(f)).sort()) {
  const loc = file.replace(/^listing\.|\.json$/g, '');
  const data = JSON.parse(readFileSync(join(STORE_DIR, file), 'utf8'));

  for (const [path, max] of Object.entries(LIMITS)) {
    const v = get(data, path);
    if (v == null) { errors.push(`${loc}: missing ${path}`); continue; }
    const n = cp(v);
    rows.push([loc, path, `${n}/${max}`, n > max ? 'OVER' : 'ok']);
    if (n > max) errors.push(`${loc}: ${path} is ${n} chars, limit ${max}`);
  }

  // Apple keyword field: byte limit, no space after comma, >2 chars per keyword phrase, no dup tokens,
  // and no token already present in name or subtitle (Apple indexes those separately).
  const kw = get(data, 'apple.keywords');
  if (kw == null) { errors.push(`${loc}: missing apple.keywords`); }
  else {
    const b = bytes(kw);
    rows.push([loc, 'apple.keywords', `${b}/${KEYWORDS_BYTES}B`, b > KEYWORDS_BYTES ? 'OVER' : 'ok']);
    if (b > KEYWORDS_BYTES) errors.push(`${loc}: apple.keywords is ${b} bytes, limit ${KEYWORDS_BYTES}`);
    if (/,\s/.test(kw)) errors.push(`${loc}: apple.keywords has a space after a comma (wastes characters)`);
    const phrases = kw.split(',').map((p) => p.trim());
    const seen = new Set();
    for (const p of phrases) {
      if (p === '') errors.push(`${loc}: apple.keywords has an empty entry`);
      if (cp(p) <= 2) errors.push(`${loc}: apple.keywords entry "${p}" is <=2 chars (Apple ignores it)`);
      const key = p.toLowerCase();
      if (seen.has(key)) errors.push(`${loc}: apple.keywords duplicate entry "${p}"`);
      seen.add(key);
    }
    // dup against name + subtitle tokens
    const titleToks = new Set([
      ...tokens((get(data, 'apple.name') || '').replace(/[:\-–—]/g, ' ')),
      ...tokens((get(data, 'apple.subtitle') || '').replace(/[:\-–—]/g, ' ')),
    ]);
    const kwToks = tokens(kw);
    const dups = [...new Set(kwToks.filter((t) => titleToks.has(t)))];
    if (dups.length) warns.push(`${loc}: apple.keywords repeats name/subtitle token(s): ${dups.join(', ')} (wasted budget)`);
  }

  // screenshots
  const shots = data.screenshots || [];
  if (shots.length !== 6) errors.push(`${loc}: expected 6 screenshots, found ${shots.length}`);
  shots.forEach((s, i) => {
    if (!s.headline || !s.subline) errors.push(`${loc}: screenshot ${i + 1} missing headline/subline`);
    if (cp(s.headline || '') > SCREEN_HEADLINE_MAX) warns.push(`${loc}: screenshot ${i + 1} headline ${cp(s.headline)} chars (>${SCREEN_HEADLINE_MAX}, thumbnail may truncate)`);
    if (cp(s.subline || '') > SCREEN_SUBLINE_MAX) warns.push(`${loc}: screenshot ${i + 1} subline ${cp(s.subline)} chars (>${SCREEN_SUBLINE_MAX})`);
  });

  if (!data.reviewer_notes) errors.push(`${loc}: missing reviewer_notes`);

  // A/B variants (English only carries them; others carry ab_note)
  if (loc === 'en') {
    const ab = data.ab_variants || {};
    const subs = ab.apple_subtitle || [], shorts = ab.google_short_description || [];
    if (subs.length !== 3) errors.push(`en: expected 3 apple_subtitle variants, found ${subs.length}`);
    if (shorts.length !== 3) errors.push(`en: expected 3 google_short_description variants, found ${shorts.length}`);
    subs.forEach((v, i) => {
      if (!v.hypothesis) errors.push(`en: apple_subtitle variant ${i + 1} missing hypothesis`);
      if (cp(v.text || '') > AB_SUBTITLE_MAX) errors.push(`en: apple_subtitle variant ${i + 1} "${v.text}" is ${cp(v.text)} chars, limit ${AB_SUBTITLE_MAX}`);
    });
    shorts.forEach((v, i) => {
      if (!v.hypothesis) errors.push(`en: google_short_description variant ${i + 1} missing hypothesis`);
      if (cp(v.text || '') > AB_SHORT_MAX) errors.push(`en: google_short_description variant ${i + 1} is ${cp(v.text)} chars, limit ${AB_SHORT_MAX}`);
    });
  } else if (!data.ab_note) {
    warns.push(`${loc}: no ab_note (A/B runs in English; note recommended)`);
  }
}

const w = (a) => String(a);
console.log('FIELD LENGTHS');
console.log(rows.map((r) => `  ${w(r[0]).padEnd(6)} ${w(r[1]).padEnd(24)} ${w(r[2]).padStart(10)}  ${r[3]}`).join('\n'));
if (warns.length) { console.log('\nWARNINGS'); warns.forEach((x) => console.log('  ! ' + x)); }
if (errors.length) { console.log('\nERRORS'); errors.forEach((x) => console.log('  x ' + x)); console.log(`\nFAIL: ${errors.length} error(s).`); process.exit(1); }
console.log(`\nPASS: all fields within limits${warns.length ? `, ${warns.length} warning(s)` : ''}.`);
