# Round 106 evidence: store badges (F410), durable model storage (F411), returning visits (F412)

## F410: where the badge artwork comes from and the terms it is used under

| badge | source | files |
|---|---|---|
| Apple "Download on the App Store", black | `https://toolbox.marketingtools.apple.com/api/badges/download-on-the-app-store/black/<lang>?size=250x83` (the service the guidelines page links; the old `tools.applemarketingtools.com` host no longer resolves) | `apps/mobile/public/badges/app-store-<code>.svg` |
| Google "Get it on Google Play" | Partner Marketing Hub, "Download all assets" zip from `play.google.com/intl/en_us/badges/`, folder `Get it on Google Play Badges/Digital/svg` (Japanese exists there only as the Print SVG, which has the same artwork and ratio) | `apps/mobile/public/badges/google-play-<code>.svg` |

Locale mapping: en = en-us, ja = ja-jp, de = de-de, fr = fr-fr, es = es-es, pt-BR = pt-br, ko = ko-kr, zh-Hant = zh-tw
(Apple). For Google it is English, Japanese, German, French, Spanish, Portuguese-Brazil, Korean and Chinese-Taiwan.
The only edit was removing editor metadata (Inkscape/Sodipodi nodes, comments, `<title>`). The paths are untouched.
Every file renders identically before and after, as the rsvg contact sheet check showed.

What the guidelines ask, and how the build meets it:

- **Apple (developer.apple.com/app-store/marketing/guidelines).** Minimum height on screen is 40 px, and the badges
  are drawn at exactly 40. The minimum clear space is a quarter of the height (10 px). The gap between the two
  badges is 10 px, and each sits in a 44 px touch target. Use the preferred black badge when other platforms'
  badges appear, which is what ships. Use the localized artwork and never translate "App Store". Do not modify the
  badge. Include Apple credit lines wherever legal information is provided: the site footer now carries Apple's
  credit line in all 8 languages.
- **Google (Partner Marketing Hub, Lockups, icons and badges).** Minimum digital height is 28 px. The Play badge
  must be the same size as or larger than other store badges, and both are 40 px high. Clear space is a quarter of
  the height. Use the localized badge for a non-English campaign. Do not recolour or rearrange it. The footer's
  existing line "Google Play and the Google Play logo are trademarks of Google LLC" stays.
- **Open point for Moshe.** Both guidelines assume the badge leads to a live listing. The links stay on
  `inbornapp.com/download` until the listings are public, as he approved, and the site keeps its "Opens at launch"
  line under each badge.

l.hebrewbible.app draws its own black pill (Font Awesome logo plus "Download on the / App Store" text). This round
uses the stores' own artwork, which gives the same look with the official marks.

Screens (`badges/`, from `shoot.mjs` and `siteshot.mjs`, deviceScaleFactor 2):

- **App screens.** `badges-{chat,paywall,vault}-{1440,390}[-dark].png` cover the web strip, the paywall store
  block and the browser vault door.
- **Per language.** `badges-paywall-390-<lang>.png` shows each language's badges.
- **The 280 px column.** `badges-in-280.png` shows the pair inside a 280 px column; it is 265 px wide and needs no wrap.
- **The site.** `site-download-*.png` shows the download row at 1440 and 390, light and dark, English and Japanese.
- **Measurements.** `badges-report.json` has every badge's box, its `aria-label`, its `role=link`, and whether the
  image loaded. The page never scrolls sideways at either width.

## F411: the persist request and what Settings says

- **Unit tests.** `apps/mobile/src/web/durable.test.ts` checks the request, the stored answer, a refusal, a
  missing or throwing API, and the Safari, iOS, Chromium and Firefox hint rules. It also checks that an installed
  app hides the hint.
- **Headless Chromium.** `return-check.txt` shows what happens without a grant. After the first download the
  page logs `[storage] persist after download: refused` and stores `{"granted":false,"reason":"download"}`.
  `navigator.storage.persisted()` is `false`, and Settings reads "The browser may clear it when space runs low"
  (`shots/return-settings-first.png`).
- **With the grant.** `Browser.grantPermissions(["durableStorage"])` stands in for what Chrome grants an
  installed, bookmarked or engaged site. The app's own onboarded request then logs `granted`, `persisted()` is
  `true`, and Settings reads "Storage is protected from automatic cleanup" (`shots/return-settings-granted.png`).
  A CDP grant ends with the browser session, so the restarted profile reads `persisted() = false` again. That is a
  property of the harness, not of the app.
- **Safari.** With a Safari user agent, the Model step and Privacy & storage show the Dock hint. With
  `display-mode: standalone` the hint is gone (`badges/install-hint-*`, `badges-report.json` keys `safari` and
  `safariInstalled`).
- **Red first.** `red-unit.txt` holds the new tests before the code, with 8 failing. The sabotage run
  `red-return-check-sabotaged.txt` rebuilt with the post-download request removed, and the check fails with
  `persistLine: null`.

Manual check in desktop Chrome, because headless cannot earn engagement:

1. Open the web app. Take the Model step's download, and let it finish.
2. Open DevTools, then the Console, and run `await navigator.storage.persisted()`. Chrome grants silently to a site
   that is installed, bookmarked or engaged. Otherwise the answer is `false` until one of those holds.
3. Go to Settings, then Privacy & storage. "Browser cleanup" reads "Storage is protected…" when the answer is `true`.
4. Install the page (the install icon in the address bar) and reload. The next onboarded load asks again, and the
   row reads protected.

Manual check in Safari on the Mac: File, then Add to Dock. Open Inborn from the Dock. The hint is gone from
Privacy & storage.

## F412: returning visits (`scripts/web-return-check.mjs`, part of `pn web:smoke`)

The check uses a persistent profile and downloads Instant once. Then, with no GGUF request and no Model step at
any point, each of these must reach the chat on wllama:

| visit | time to chat | GGUF requests | Model step |
|---|---|---|---|
| browser closed and relaunched on the same profile | 1.6 s | 0 | never shown |
| page clock pinned 8 days ahead (2026-10-05) | 1.6 s | 0 | never shown |
| after a deploy (build A to B, the F404 hand-over took 1.3 s) | 1.4 s | 0 | never shown |

The whole check took 22.3 s, of which 14 s is the one download (`return-check.txt`; earlier runs took up to
29.3 s), so it runs inside `web:smoke` (`web-smoke.txt`, 22.6 s there). Screens: `shots/return-{restart,8-days,update}.png`.
