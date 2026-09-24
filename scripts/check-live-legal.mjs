#!/usr/bin/env node
/**
 * Pure comparators for scripts/check-live.mjs's legal-text guard (F364).
 *
 * `docs/legal/*.md` and `docs/legal/NOTICE.json` are the only source of the site's legal pages (round 42,
 * "legal-from-site": apps/site/build.mjs:719-722 renders privacy/terms/accessibility from the markdown and
 * licenses from the JSON). Wave-3 verifier C02 found the live site matched that source word for word, but nothing
 * in the codebase re-checks that after every deploy — this module is that check, kept fetch-free so it can be
 * unit-tested against real built HTML without a network call.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** [route, docs/legal source] — the three pages every locale renders in English verbatim (build.mjs's legalPage
 *  only translates the "this document is English-only" notice above the article, never the article itself). */
export const MD_LEGAL_PAGES = [
  ["/privacy", "privacy-policy.md"],
  ["/terms", "terms.md"],
  ["/accessibility", "accessibility-policy.md"],
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', nbsp: " ", mdash: "—", ndash: "–" };
const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27|rsquo|lsquo|ldquo|rdquo|nbsp|mdash|ndash);/g, (_m, name) => ENTITIES[name]);
const toWords = (s) =>
  decodeEntities(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** The one element both the live page and the build share: `<article class="prose legal">...</article>`. */
export function extractArticle(html) {
  return /<article class="prose legal"[^>]*>([\s\S]*?)<\/article>/.exec(html)?.[1] ?? "";
}

export function repoLegalWords(mdFile) {
  /* Mirrors what markdownToHtml/legalPage (apps/site/build.mjs:155,182) drop before publishing: the H1 (the page
     supplies its own <h1> from i18n) and any "Spec basis: …" line (a maintainer note, never reader-facing text). */
  const src = readFileSync(path.join(repoRoot, "docs/legal", mdFile), "utf8")
    .replace(/^# .*\n/, "")
    .replace(/^Spec basis:.*\n/m, "");
  return toWords(src.replace(/[*`#>_]/g, " "));
}

export function liveLegalWords(html) {
  return toWords(extractArticle(html).replace(/<[^>]+>/g, " "));
}

/**
 * null when the two word streams are identical; otherwise a one-line report — first divergence plus a multiset
 * diff — in the same shape the verifier compared by hand (scratchpad/verify3/c02/diff.mjs).
 */
export function legalWordDiff(liveWords, repoWords) {
  if (liveWords.length === repoWords.length && liveWords.every((w, i) => w === repoWords[i])) return null;
  let i = 0;
  while (i < liveWords.length && i < repoWords.length && liveWords[i] === repoWords[i]) i++;
  const count = (arr) => arr.reduce((m, w) => ((m[w] = (m[w] || 0) + 1), m), {});
  const a = count(liveWords);
  const b = count(repoWords);
  const onlyLive = [];
  const onlyRepo = [];
  for (const w of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (a[w] || 0) - (b[w] || 0);
    if (d > 0) onlyLive.push(`${w}×${d}`);
    if (d < 0) onlyRepo.push(`${w}×${-d}`);
  }
  return `live ${liveWords.length} words, repo ${repoWords.length} words; first divergence at word ${i}: live="${liveWords.slice(i, i + 8).join(" ")}" repo="${repoWords.slice(i, i + 8).join(" ")}"; only-live: ${onlyLive.slice(0, 15).join(" ") || "(none)"}; only-repo: ${onlyRepo.slice(0, 15).join(" ") || "(none)"}`;
}

/** The "model" section's component names, in row order, as licensesPage() (apps/site/build.mjs) renders them.
 *  Only the row's first cell (the component name link) is taken — the second cell is also an `<a>`, for the
 *  license name, which a "first <a> anywhere in the section" regex would wrongly interleave into the list. */
export function liveLicenseModelNames(html) {
  const body = /<h2 id="model"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "";
  return [...body.matchAll(/<tr>\s*<td><a[^>]*>([^<]*)</g)].map((m) => decodeEntities(m[1]).trim());
}

export function repoLicenseModelNames(notice = JSON.parse(readFileSync(path.join(repoRoot, "docs/legal/NOTICE.json"), "utf8"))) {
  return notice.components.filter((c) => c.group === "model").map((c) => c.name);
}

/**
 * Whether a live/repo model-name mismatch on /licenses is a real drift (fail) or just an undeployed catalog bump
 * that the site cannot show yet (warn). `liveCatalogVersion` is what the live /models/manifest.json answers for
 * `version` right now (packages/core/src/catalog/manifest.json's own field); null means it could not be read,
 * which is judged as "warn" rather than "fail" so one extra fetch failing cannot fail a gate that is really about
 * legal text. This is what keeps the guard honest between round 72 (F334-F336, nomic → e5 in NOTICE.json) shipping
 * in the repo and Deploy 5 actually publishing the new catalog.
 */
export function judgeLicenseDrift({ liveNames, repoNames, liveCatalogVersion, repoCatalogVersion }) {
  const same = liveNames.length === repoNames.length && liveNames.every((n, i) => n === repoNames[i]);
  if (same) return { level: "ok" };
  const detail = `live model list: ${liveNames.join(", ") || "(none found)"} — repo docs/legal/NOTICE.json: ${repoNames.join(", ")}`;
  if (liveCatalogVersion == null) {
    return { level: "warn", message: `licenses page model list differs from docs/legal/NOTICE.json, but the live catalog version could not be read to judge whether it is just pending a deploy — ${detail}` };
  }
  if (liveCatalogVersion < repoCatalogVersion) {
    return { level: "warn", message: `licenses page model list differs from docs/legal/NOTICE.json, but the live catalog is still version ${liveCatalogVersion} (repo is ${repoCatalogVersion}) — expected until the next model deploy publishes it — ${detail}` };
  }
  return { level: "fail", message: `licenses page model list differs from docs/legal/NOTICE.json and the live catalog is already version ${liveCatalogVersion} (repo ${repoCatalogVersion}), so this is not a pending deploy — ${detail}` };
}
