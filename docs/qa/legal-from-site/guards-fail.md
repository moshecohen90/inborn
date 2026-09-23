# Round 42 · guards watched red (branch `legal-from-site`, 23.9.2026)

Every guard added in this round, sabotaged once so the failure is on record, then restored. Run with
`corepack pnpm@10.34.5 --filter @inborn/mobile test` (and `node docs/store/scripts/check-store-copy.mjs` for the last
one). The first attempt at the `LegalSource` guard PASSED its sabotage because it matched the import line rather than
the rendered element; it was tightened and re-run, which is the second entry for it below.


=== SABOTAGE: site.css --text-3 back to the drifted #667380 ===
     × --text-3 is the app's token 4ms
     × --text-3 reaches 4.5:1 on every surface the site puts it on 0ms
AssertionError: dark --text-3: expected '#667380' to be '#7A8794' // Object.is equality
    317|     expect(darkCss[cssName], `dark --${cssName}`).toBe(dark[token].toU…
    318|     expect(lightCss[cssName], `light --${cssName}`).toBe(light[token].…
AssertionError: dark --text-3 on --bg: expected 4.013604452184076 to be greater than or equal to 4.5
 Test Files  1 failed | 49 passed (50)
      Tests  2 failed | 396 passed (398)

=== SABOTAGE: site build stops publishing /accessibility ===
 Test Files  1 failed | 49 passed (50)
      Tests  314 passed | 84 skipped (398)

=== SABOTAGE: Legal screen no longer offers the live page ===
      Tests  398 passed (398)

=== SABOTAGE: delete-button contrast fixed, so the admitted gap is stale ===
     × the delete/wipe contrast the statement admits is the contrast the tokens still have 4ms
AssertionError: expected 5.2597522387438005 to be less than 4.5
      Tests  1 failed | 397 passed (398)

=== restored: all green again ===
 Test Files  50 passed (50)
      Tests  398 passed (398)

=== SABOTAGE (redone): the /accessibility page is deleted from the site build ===
     × every path the app opens is a page the site build produces 5ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: the site serves no /accessibility: expected [ 'apps/site/dist/404.html', …(6) ] to include 'apps/site/dist/accessibility.html'
    253|       expect(SITE_DIST, `the site serves no ${path}`).toContain(`apps/…
 Test Files  1 failed | 49 passed (50)
      Tests  1 failed | 397 passed (398)

=== SABOTAGE (redone): Legal screen no longer renders the live-page block ===
     × the screen that shows a document is the screen that offers its live page 8ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: privacy's screen offers no live page: expected 'import { useMemo } from "react";\nimp…' to match /<LegalSource\b/
 Test Files  1 failed | 49 passed (50)
      Tests  1 failed | 397 passed (398)

=== SABOTAGE: docs/store/listing.fr.json loses urls.accessibility ===
  x fr: urls.accessibility is missing
FAIL: 1 error(s).
(restored → PASS: all fields within limits.)
