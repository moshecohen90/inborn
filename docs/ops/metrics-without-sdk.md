# Metrics without an SDK

Spec basis: §15 (table and gates), §15.1 (what we deliberately do not measure), §13.4 (web), §12.5 (forecast). Written 6 September 2026.

The app contains no analytics, crash reporter, device id or ping. Everything below is read from consoles the stores and Cloudflare already run, from the OS-level diagnostics users opt into with Apple/Google (not with us), and from what users tell us voluntarily. That is enough: the numbers that remain are exactly the ones that move the business.

## 1. Where each number lives

| Metric | Source | Path | Cadence | Notes |
|---|---|---|---|---|
| Downloads / day (iOS) | App Store Connect › Analytics › Metrics › Total Downloads (first-time + redownloads split) | Safari, existing developer account; ASC API `salesReports` for the CSV | daily rollup, weekly review | ASC counts all users; opt-in only affects sessions/retention |
| Downloads / day (Android) | Play Console › Statistics › Installs (new users) | Safari; `gsutil` export bucket for CSV | daily | |
| Store page conversion | ASC › Analytics › Acquisition › Conversion Rate; Play › Store performance › Store listing conversion | weekly | iOS conversion is impressions-based; compare like with like across weeks, not across stores |
| Impressions and search share | ASC › Acquisition › Sources › App Store Search; Play › Store performance › Store listing acquisitions › Search | weekly | feeds ASO |
| Rating and review count | ASC › Ratings and Reviews; Play › Ratings and reviews | daily (existing review-reply mechanism) | every review answered through the existing `store-reviews` skill, under the neutral developer name |
| Pro conversion (of installers) | (Pro units from ASC › Sales and Trends, IAP filter) ÷ downloads; Play › Monetisation › In-app products; Paddle dashboard | weekly | denominator = all installers in the same window (spec §12.5 convention) |
| Net monthly revenue | ASC › Payments and Financial Reports (post-commission); Play › Financial reports; Paddle payouts; Microsoft Partner Center | monthly, on the 5th | 15% via Small Business Program (Apple) and Play's 15% tier; Paddle ~5% + $0.50 |
| Refunds | ASC › Sales and Trends › Refunds; Play › Financial reports › Refunds; Paddle | weekly | target < 3% at month 3, < 2% at month 12 |
| Retention D1 / D7 | Play Console › Statistics › Retention (cohorts) only | weekly | Apple gives retention only for opted-in users under App Analytics; record it but label it "opt-in sample" |
| Crashes | Play › Android vitals (crash rate, ANR rate); Xcode › Organizer › Crashes (opt-in users); user-sent "Report a problem" files by email | daily glance, weekly log | vitals are OS-collected, so they work with no INTERNET permission |
| Keyword ranks | existing ASO rank tracker (weekly job) with the Inborn keyword sets from spec §13.1 | weekly | targets: top-10 "offline ai chat" (Play) at month 3; top-3 "private ai chat" (iOS) and "offline chatbot" (Play) at month 12 |
| Web traffic | Cloudflare › Web Analytics (cookieless) and zone analytics for `{{DOMAIN}}` | weekly | no JS analytics on the app or demo origin; the demo origin is measured by Cloudflare request logs only |
| Desktop installs and Work conversion | Microsoft Partner Center › Acquisitions; Paddle › Transactions | monthly (phase 3) | |
| "Why" | reviews, support inbox, user-sent problem files, the voluntary "what's missing" email from Settings | continuous | tagged in the support tracker; summarised in the weekly note |

Experiments are store-level only: Product Page Optimization (App Store) and Store listing experiments (Play), plus Play price experiments. Nothing inside the app is A/B tested; a change is measured between versions.

## 2. What we do not measure, on purpose (§15.1)

Messages sent, models loaded, chat length, runtime errors, feature usage, session length. No device identifier, no daily ping, no server-side flags. If a metric on this list is ever wanted, the answer is a between-versions store experiment or a voluntary survey, never an SDK.

## 3. Decision gates (§15.2)

| Gate | When | Condition | If met | If not |
|---|---|---|---|---|
| A | month 3 after launch | downloads > 150/day (7-day average, both stores) **and** rating > 4.5 (both stores, weighted by count) | start phase 2 (web) | one month of ASO and review-driven fixes before any expansion |
| B | month 4 (end of phase 2) | Pro conversion > 1.5% (cumulative since launch) **and** 50+ reviews mentioning documents or work | start phase 3: desktop and Work (weeks 18–25) | deepen mobile (voice, vision) before desktop |
| C | month 12 | net revenue > $8,000/month (3-month average) | App Transfer to a dedicated entity; hire a second developer | maintenance mode: model updates only, stays a small profitable unit |

Gate reviews are a dated note in `docs/ops/metrics/` with the table from §5 filled in, and a one-line recommendation for Moshe. Only Moshe passes a gate.

## 4. Weekly routine (Monday, ~40 minutes, no SDK needed)

1. Pull the week: ASC and Play console numbers (Safari, existing sessions) into the template below; Cloudflare Web Analytics for the site; Paddle/MS Partner Center once phase 3 is live.
2. Read every new review and every support email; tag each: crash, heat, model quality, download, purchase, feature request, praise.
3. Check Android vitals and Xcode Organizer for new crash signatures; open a repo issue per signature with the stack, never with user text.
4. Compare against the month-3 / month-12 targets and the previous week; note what changed in the app or the listing that week (version, ASO edit, price experiment).
5. Write the weekly note (`docs/ops/metrics/YYYY-WW.md`, Hebrew for Moshe, numbers in tables) with one recommended action. Anything that needs money or a store change goes to the task board via the task-manager agent.
6. Before gate months, run the gate table in §3.

## 5. Template (copy into `docs/ops/metrics/YYYY-WW.md`)

```
# Inborn weekly metrics · week YYYY-WW (dates)

| Metric | This week | Last week | Month-3 target | Month-12 target | Source |
|---|---|---|---|---|---|
| Downloads/day iOS | | | 300 (both) | 2,500 (both) | ASC |
| Downloads/day Android | | | | | Play |
| Store conversion iOS (%) | | | ≥ 30 | ≥ 35 | ASC |
| Store conversion Android (%) | | | ≥ 30 | ≥ 35 | Play |
| Rating · count iOS | | | 4.6 · 200 | 4.7 · 3,000 | ASC |
| Rating · count Android | | | | | Play |
| Pro units / conversion (%) | | | 1.5 | 2.5–3 | ASC + Play (+ Paddle) |
| Net revenue (month to date) | | | $2K | $28K target · $8K gate C | financial reports |
| Refund rate (%) | | | < 3 | < 2 | financial reports |
| Retention D1 / D7 (Play) | | | 45 / 20 | 50 / 25 | Play |
| Crash rate (Play vitals) · iOS crashes (opt-in) | | | < 0.5% | < 0.3% | vitals · Organizer |
| Keyword: private ai chat (iOS) · offline chatbot (Play) · offline ai chat (Play) | | | top-10 offline ai chat | top-3 both | rank tracker |
| Site visits (Cloudflare) | | | 5K/mo | 50K/mo | Cloudflare |
| Desktop installs · Work units | | | — | 1,000/mo · 50 | MS Store · Paddle |

What changed this week (version / listing / price): …
Voice of the user (top 3 tags with counts): …
Crash signatures opened: …
Recommendation (one line): …
```

## 6. Sources

- Spec §15 table (targets) and §15.2 (gates); §12.5 forecast.
- Apple App Analytics opt-in model: https://developer.apple.com/app-store-connect/analytics/
- Android vitals are collected by the platform from opted-in users: https://developer.android.com/topic/performance/vitals
- Cloudflare Web Analytics is cookieless and script-optional (server-side mode): https://developers.cloudflare.com/web-analytics/
