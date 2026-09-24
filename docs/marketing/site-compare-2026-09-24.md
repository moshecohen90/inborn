# /compare, round 68 — 24.9.2026 (F319)

The page the round-41 site read named as the single highest-value missing page for web organic
(`site-2026-09-23.md`, "Not done"). One page at `/compare`, in the existing generator: plain HTML, zero JavaScript in
the output, zero third-party requests, and the same gate.

## Why one page and not `/compare/<competitor>`

Measured, by the `aso-specialist` agent, Google Ads historical metrics, US, on 24.9.2026:

| Query | US searches/month |
|---|---|
| lm studio vs ollama + ollama vs lm studio | 2,900 + 1,600 |
| best local llm | 1,600 |
| is chatgpt private | 1,300 |
| ollama alternative | 880 |
| chatgpt privacy | 720 |
| on device ai | 590 |
| lm studio alternative | 390 |

Against that, the per-competitor queries that would justify child pages do not exist: `pocketpal alternative` 10,
`enclave ai app` 10, and `pocketpal vs private llm` and `private llm vs enclave` return no data at all. Eight of ten
candidate child pages would target under 50 searches a month between them, on a domain with no backlinks. That is a
doorway cluster, so: one page.

**When that changes:** split `/compare/ollama` first, and only when all three hold — the single page reaches the top
20 in Search Console for one head term, the site has 15 or more referring domains, and that competitor query shows 300
or more impressions a month on the parent page. Measure for 60 days before splitting a second.

Four of the seeds we started from are dead for web search and belong only in the store listings:
`offline ai chat app` 40, `ai without internet` 30, `chatgpt alternative offline` 10, `best offline ai app` 20. The
split is real and worth remembering: `ai without internet` scores 94/100 on Play autocomplete and 0 on the App Store,
while `lm studio vs ollama` has no store analogue at all. Nobody types "ollama alternative" into the App Store, which
is the whole reason this is a web page and not store copy.

English only. German and Brazilian buyers search the English terms; the localised long tail is 50 to 390 a month. The
one term that would justify a future `/de/compare` is `lokale ki`, at 720 and rising, and the trigger is roughly 1,500.

## What is on the page

Nine sections, numbered in the same rail as the landing page.

| # | Section | Owns |
|---|---|---|
| 01 | Cloud AI and on-device AI: what actually leaves your phone | on device ai, is chatgpt private |
| 02 | Is ChatGPT private? What the cloud assistants store | chatgpt privacy |
| 03 | Table A: Inborn compared with the cloud assistants | chatgpt alternative |
| 04 | Inborn, Ollama and LM Studio | lm studio vs ollama, ollama alternative |
| 05 | Table B: Inborn compared with the other on-device AI apps | best local llm |
| 06 | No account, no login, no subscription | ai chat no login, chatgpt no account |
| 07 | Where the others are better than Inborn | — |
| 08 | How to check any of this yourself | — |
| 09 | Eight questions people ask when comparing | the FAQPage graph |

Copy by the `conversion-copywriter` agent, keyword targets by `aso-specialist`, answer-engine shape by
`aeo-specialist`, every competitor fact checked against that competitor's own public page before it was written.

## The rule the page is built on

**Every claim about a competitor links to that competitor's own page, and a cell we could not verify says "Not
verified" rather than guessing.** This is not modesty. Claude's own ranking rule, quoted verbatim in the probe this
week, downgrades apps whose claims it cannot audit, and a single wrong price in a comparison table is what the
category punishes hardest.

Claims deliberately **not** made, each with what contradicted it:

| Not said | Why |
|---|---|
| "No competitor ships without the INTERNET permission" | We read six release manifests (PocketPal AI, MLC Chat, Google AI Edge Gallery, SmolChat, LLM Hub, MyDeviceAI) and all six declare it. Layla, Private LLM's Android beta and Maid are closed or have no committed manifest. The page says "the six we could read", and names them. |
| A ChatGPT price, or any quote from OpenAI | `openai.com` and `help.openai.com` returned 403 to every fetch on 24.9. The page says so on the page and links their pricing instead. |
| "Cloud apps require an account" | Gemini, Copilot and Perplexity all work signed out, in their own words. The page says signing in is where the retention clocks start. |
| A training default for Claude | Anthropic's privacy policy ("unless you opt out") and privacy centre ("if you choose to allow") disagree. The page links both and states no default. |
| "We are cheaper" | Private LLM is 4.99 USD one time, a quarter of Inborn Pro. The page says that twice, including in the FAQ. |
| "Offline is our differentiator" | It is table stakes. Google's own AI Edge Gallery says no internet is required, free, Apache-2.0. The differentiator is the missing Android permission, and the page opens section 05 by saying so. |

Section 07 exists for the same reason: Enclave AI gives documents away free, Layla generates images on the device,
PocketPal AI is MIT, LM Studio and Ollama are free and better on a desktop, Apple Intelligence costs nothing. A
comparison page that finds no rival better than us is read as an advert, by a person and by an engine.

Two questions are deliberately **not** on this page — whether Inborn is open source, and what a small model gives up —
because they are already answered on the home FAQ. Two URLs carrying one answer split the citation and neither wins.
The page links the home anchors instead.

## Mechanics

- `apps/site/src/pages/compare.html` is a page fragment, so the generator picks it up, and `/compare` enters
  `sitemap.xml`, `llms.txt` and `llms-full.txt` automatically. It is in the Product group of `llms.txt`.
- Table B and the `ItemList` graph both render from **one array**, `COMPARE_APPS` in `build.mjs`, the way the landing
  FAQ already renders the visible list and the `FAQPage` graph from one array. A row and its structured-data entry
  cannot drift. Same for the eight FAQ answers and `COMPARE_FAQ`.
- The date on every price, license and permission is the token `{{COMPARE_CHECKED}}`, written once in `build.mjs`. A
  re-check changes one line.
- Graph: `WebPage`, `ItemList` of nine `SoftwareApplication` items, `FAQPage` of eight questions, `BreadcrumbList`,
  on top of the site-wide `WebSite`, `Organization` and `Brand`. **No** second `SoftwareApplication` with Offer nodes
  for Inborn (the home page states the prices; two price statements can drift), no `aggregateRating` (no real store
  ratings exist), and nothing marked up about a competitor beyond its name and its own URL.
- `FAQPage` earns no Google rich result any more: that was removed for all sites in May 2026. It stays because it is
  free, because it is generated from the visible text, and because non-Google extraction still reads it.
- Links in: the header nav, the footer Product column, the home pricing and models sections, `/proof`, `/download`,
  and all three blog posts, each with a different anchor. Links out from `/compare` to `/proof`,
  `/blog/how-the-proof-works`, `/blog/why-on-device`, `/blog/choosing-a-model` and `/download`, so the page passes
  authority back instead of hoarding it.
- Guards: two unit tests in `apps/mobile/test/legal-texts.test.ts` (no ChatGPT price, no unscoped permission claim) and three
  checks in `apps/site/check.mjs` (every row carries every column with no blank cell, every competitor links its own page, no
  FAQ question duplicated from the home page). All five were watched red with a deliberate break; the output is in
  `docs/qa/aso-compare/guard-red-f319.txt` and `guard-red-f319-check.txt`.
- Two CSS rules only: `.compare-table` widens the minimum table width to 1180px, because six columns of whole
  sentences at the model table's 760px sets three words to a line. Both tables scroll inside `.table-wrap`, so the
  page itself never scrolls sideways.

## Verified

`pnpm --filter @inborn/site build` then `check.mjs`: 14 pages, no scripts, no external assets, no dead links, CSP
present, no sideways scroll at 390 or 768.

Screenshots in `docs/qa/aso-compare/`, full page, at 390, 768, 1024 and 1440, in dark and light. The screenshot run
also asserts the page fetches nothing off-origin at any width or scheme: **none**, and document overflow is 0px at all
eight combinations.

Externally verified by hand on 24.9.2026, not taken from the research pass: `github.com/moshecohen90/inborn` is public
(`"private": false`), PocketPal AI's and MLC Chat's and Google AI Edge Gallery's release manifests declare
`android.permission.INTERNET`, Private LLM is `$4.99` on the US App Store, Layla is `$19.99`, Enclave AI's pricing page
says "Pro $9.99 / month" with local models "always free", and Microsoft's transparency note says "Copilot relies on
Internet connectivity to function".

## Open asks

1. **Deploy.** `inbornapp.com` serves the round-41 build; `/compare` is 404 in production until this branch ships.
2. **Bing.** Zero pages of the site are in Bing's index, so ChatGPT cannot cite this page however good it is. Bing
   Webmaster Tools submission is unassigned.
3. **Re-check date.** Every price on the page carries 24 September 2026. Re-run the checks before any quarter passes,
   and change `COMPARE_CHECKED` in the same commit.
