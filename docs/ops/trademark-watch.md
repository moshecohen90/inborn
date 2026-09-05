# Trademark watch, domain calendar and filing plan

Spec basis: §3.2 (Inborn clearance), §11.6 (how trademarks work and what we do before any publication), §14.6 (costs). Research files: `docs/research/trademark-clearance-2026-09-03.md` (Autark failure), `docs/research/brand-round2-2026-09-03.md` (Inborn clearance in EM/US/GB/WO/DE/FR/JP). Written 6 September 2026.

## 1. Monthly watch: `scripts/tm-watch.sh`

What it does (already in the repo): POSTs a "contains" search for the name to the TMview API (tmdn.org), filters to **identical** word marks that are **live** in **classes 9 or 42** at **EM, US, GB or WO**, prints them, and exits 1 when any exist (2 when TMview is unreachable, 0 when clean). Run by hand:

```
bash scripts/tm-watch.sh            # default name: Inborn
bash scripts/tm-watch.sh Inborn     # explicit
```

Baseline on 3 September 2026: zero identical live marks in 9/42 at the seven offices searched. Re-run 6 September 2026 with this script: 264 TMview results for "Inborn", 0 identical live marks in 9/42 at EM/US/GB/WO, exit 0. The only neighbour is a US application "INKBORN" (different word, classes 41/42, storytelling service): not blocking (spec §3.2).

### Monthly schedule (launchd, not installed by this stream)

The plist below runs the script on the 1st of every month at 09:30 local time, appends the output to a log, and drops a marker file when the exit code is non-zero so the daily task pass can raise it on the board. It is **written under `docs/ops/` only**; installing it is a one-line action for Moshe or the lead, and it should go through the existing `scheduled-tasks` skill (`tasksctl.sh`) so it appears with the other company jobs:

```
cp docs/ops/com.inbornapp.tm-watch.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.inbornapp.tm-watch.plist
launchctl kickstart -k gui/$(id -u)/com.inbornapp.tm-watch    # optional: run once now
```

Log: `~/Library/Logs/inborn/tm-watch.log`. Alert marker: `~/Library/Logs/inborn/tm-watch.ALERT` (contents = the hits). Whoever runs the daily board pass checks the marker; when it exists, open a board card "סימן מסחר זהה ל-Inborn הופיע" with the log lines, delete the marker after the card exists.

What to do when the script exits 1 (spec §11.6):
1. Read the hit: office, classes, applicant, filing date, status.
2. If **our** filing date is earlier: file an opposition within the office's window (EUIPO: 3 months from publication; USPTO: 30 days from publication in the Official Gazette, extendable; UKIPO: 2 months, extendable to 3). Through the trademark attorney.
3. If theirs is earlier and they are in an unrelated field: coexistence is likely fine; note it.
4. If theirs is earlier and in AI/software: escalate to Moshe the same day with the research; the answer may be a name change in that territory.
5. Never respond to a store takedown notice without the attorney; Apple mediates between parties (~2 weeks), Google may suspend per country.

The watch is a screen, not a full search. Before the first store publication, the attorney's full search (including Israel, Brazil, Japan) is still required (§11.6 step 2).

## 2. Dated items

| Date | Item | Owner | Notes |
|---|---|---|---|
| **25 October 2026** | `inborn.app` registration expires (parked; per spec §3.2 and §14.6). Google Registry .app: after expiry a ~30-day redemption grace, then release. Set a reminder for 25.10, then check daily from 25.11 (typical drop ~40–45 days after expiry if the owner does not renew). Use a backorder service (SnapNames/DropCatch do not cover .app well; Google Domains successor Squarespace does not backorder) — realistic path: check RDAP (`https://rdap.nic.google/domain/inborn.app`) daily in that window and register the moment it clears. | Moshe (payment) / lead (watch) | **Not verified this session**: outbound DNS to rdap.nic.google and whois were blocked from the agent sandbox. Re-verify the expiry date from RDAP before relying on it. |
| before first public listing | Buy `inbornapp.com`, `inborn.so`, `inborn.chat`, `getinborn.app` (§14.6: ≈$60–120/year) | Moshe | The store listing and privacy-policy URL depend on it |
| before first public listing | Word-mark filings (§3 below) | Moshe + attorney | Filing first is the whole point of §11.6 |
| 6 months after the first filing | Paris Convention priority window closes for other countries | attorney | Israel, Brazil, Japan if the product justifies |
| 2028-04 | `inborn.ai` expires (Namecheap, registered 2022-04-16; parked; a broker quote is optional) | Moshe | not needed for launch |
| monthly, 1st | tm-watch run | launchd | see §1 |
| yearly, on filing anniversary | Review class coverage and use evidence (screenshots of the listing, dated) | lead | First-use documentation from day one (§11.6 step 6) |

## 3. Filing plan and costs (Moshe pays; all figures are official fees, verified 5 September 2026, excluding attorney fees)

| Office | Mark | Classes | Official fee | Notes |
|---|---|---|---|---|
| EUIPO (EU trade mark, 27 states) | INBORN (word) | 9 (downloadable software; AI software), 42 (SaaS; software design) | €850 first class + €50 second class = **€900** | Online filing; first-to-file; identical mark on identical goods is an automatic ground (§11.6). Source: EUIPO fee schedule via https://www.leopatent.com/en/register-eu-trademark-euipo/ and https://vilta.cy/eu-trademark-cost/ |
| USPTO | INBORN (word, standard character) | 9, 42 | **$350 per class = $700** (base application, since 18 Jan 2025); 1(b) intent-to-use is allowed before launch, Statement of Use later (+$150/class) | Rights arise from use, registration gives nationwide presumption. Source: https://www.uspto.gov/sites/default/files/documents/TM-ExamGuide-1-25.pdf |
| UKIPO | INBORN (word) | 9, 42 | **£205 + £60 = £265** (fees rose 1 April 2026 from £170 + £50) | Source: https://www.gov.uk/government/news/intellectual-property-office-fees-to-increase-from-april-2026 |
| Israel (ILPO) | INBORN | 9, 42 | ≈ ₪1,600–1,800 first class + ≈ ₪1,200 per additional (spec §14.6: ≈$250–350) | Home market; attorney recommended |
| Attorney (full search + 3 filings) | | | typically $1,500–3,000 | Not an official fee; get two quotes |

Recommended order: EUIPO and USPTO first (both launch markets, both first-to-file/first-use risk), UKIPO with them if budget allows (cheap), Israel within the 6-month priority window. Total official fees for EU + US + UK ≈ **$2,000** at current rates; with attorney ≈ $3,500–5,000.

Spec correction: §11.6 quotes UKIPO at "£170 + £50 (rising 1.4.2026)". The rise happened: £205 + £60 since 1 April 2026. The gap backlog's "£220" is also out of date.

## 4. Practical rules (from §11.6, restated as a checklist)

- [ ] Attorney full search (EM, US, GB, IL, BR, JP) before any public listing.
- [ ] File word marks in 9/42 before the first public store page or website.
- [ ] Keep dated screenshots of first use (store listing, website) from day one.
- [ ] Watch monthly (§1); respond to hits with the attorney.
- [ ] Do not use "Inborn" with a dictionary meaning in marketing copy that weakens distinctiveness; the brand is the coined app name.
- [ ] Register the domains above before the name is public anywhere.
