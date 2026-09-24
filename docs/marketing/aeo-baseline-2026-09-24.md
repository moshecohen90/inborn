# Inborn answer-engine baseline, 24.9.2026 (F320)

The first AEO probe for Inborn. Twelve English/US buying questions, two repeats, three engines: **72 answers, 0
failures**. gpt-5 (OpenAI Responses with `web_search`), gemini-3.5-flash (Google Search grounding), Claude Sonnet
(headless `claude -p` with WebSearch).

## The number

**Inborn is named in 0 of 72 answers.** Mention 0%, first 0%, cited 0%, on every engine, every prompt, both repeats.

That is the correct result, not a failure of the page: on the day of the run the App Store listing for `id6809165161`
returns 404 and the Play listing for `com.inbornapp.mobile` returns 404, so there is nothing for an engine to find.
This run exists to fix the baseline before launch, and to name the set of apps we have to displace.

## Who owns the questions instead

| Entity | Leader share | Named anywhere |
|---|---|---|
| ChatGPT (as a product) | 29% | 75% |
| PocketPal AI | 24% | 49% |
| LM Studio | 11% | 49% |
| Jan | 8% | 33% |
| MLC Chat | 6% | 49% |
| Ollama | — | 36% |

By engine: Claude puts **PocketPal AI first in 50% of its answers** and 75% of its answers name it. Gemini alternates
PocketPal AI and LM Studio. GPT's set is looser and includes apps the brand file did not track.

Three findings that change what we build:

1. **"No account" is read as "no login to a website", not "no server".** Every engine answers that prompt with cloud
   products (ChatGPT on the web, Claude, Le Chat, Brave Leo, Duck.ai). Winning it is a framing fight, not an app fight.
2. **"One-time purchase AI app" has no owner.** The answers name obscure one-offs. It is the cheapest question on the
   board to take, and `/compare` now answers it outright.
3. **Claude states its own ranking rule**, verbatim in the run: "prioritize apps that are open source (so the 'no
   network' claim is auditable)… Closed source apps can only be verified by your own testing, never fully trusted."
   Source-available plus a check the reader runs from outside the app is the answer to that rule, and it is exactly
   what `/compare` and `/proof` say.

## What the engines cite

- gpt: 132 citations over 24 answers → github.com 16, **apps.apple.com 12**, lmstudio.ai 9, **play.google.com 8**, jan.ai 8, reddit 5.
- gemini: 337 → **reddit.com 33**, apps.apple.com 24, play.google.com 23, youtube 21, github 19, promptquorum.com 18.
- claude: 156 → promptquorum.com 15, github 13, atomic.chat 10, privatellm.app 9, localaimaster.com 7, pocketpal.dev 5.

The two store listings are the largest single citation source across all three engines. **The store listings going
live is the AEO lever, ahead of any page we write.** The listicles are second, and they are the subject of
`listicles-2026-09-24.md`.

## The blocker in front of every content lever

**Bing has zero pages of inbornapp.com indexed** (`site:`, `url:` and a quoted-domain search all return nothing on
24.9). ChatGPT's `web_search` is Bing-backed, so no page on this site can be cited by ChatGPT until that changes.
`/compare` is in `sitemap.xml` and `llms.txt` as of this round; submitting the site to Bing Webmaster Tools is a
separate, unassigned job.

## Two corrections to `site-2026-09-23.md`

That document is the round-41 record and two of its statements are now stale. Verified with plain HTTP on 24.9:

- It says "Nothing is deployed". **inbornapp.com is live**, HTTP 200, serving the round-41 landing page. `/`, `/proof`,
  `/download`, `/blog`, `/llms.txt`, `/robots.txt`, `/sitemap.xml` all 200; `/compare` was 404 before this round.
- It says the GitHub repository is private. **It is public**: `api.github.com/repos/moshecohen90/inborn` returns
  `"private": false`. The shipped `build.mjs` and the live `llms.txt` already say "source-available"; the document is
  the stale artefact, not the site.

## Reproducing the run

Configuration lives here and belongs to this repo:

- `docs/marketing/aeo/brands.inborn.json` — us plus 30 tracked competitors.
- `docs/marketing/aeo/prompts.inborn.en.json` — the 12 prompts, `in-01` … `in-12`.
- `docs/marketing/aeo/runs/2026-09-24/` — `gpt.jsonl`, `gemini.jsonl`, `claude.jsonl` (raw answers with citations),
  `summary.json` (scores), `raw-verdicts.md` (the 72 orderings in one page), `run-command.txt`.

The runner is `fbcloud/tools/marketing/aeo` and stays there. This run used a patched copy in a scratch directory,
because the fbcloud original hard-codes the Hebrew-Bible state directory and own-domain list. The whole patch is three
lines and the copy was deleted rather than forked into this repo:

```
probe.mjs:19  const STATE = path.join(process.env.AEO_STATE || path.join(os.homedir(), '.claude/state/aeo'), 'runs', RUN);
score.mjs:11  const STATE = process.env.AEO_STATE || path.join(os.homedir(), '.claude/state/aeo');
score.mjs:18  if (/inbornapp\.com/.test(d)) return 'own';
```

**Open ask for the lead:** land those three lines in fbcloud as a brand flag (`AEO_STATE` plus an own-domain list read
from `brands.json`) so a second brand needs no copy at all. Until then, every Inborn run re-applies the patch in a
scratch directory, and `~/.claude/skills/aeo/state/weekly-ledger.md` keeps Inborn as its own series.

## Next run

Re-run the same 12 prompts the week both store listings resolve. That is the first run where a non-zero score is
possible, and the first one whose delta means anything.

## Entities to add to `brands.inborn.json` before the next run

Named in this run and untracked: Locally AI by LM Studio (14 of 72 answers), Open WebUI (11), Noema, Off Grid,
Unspoken Room, Outlier, Parlin, Kobold, Duck.ai.
