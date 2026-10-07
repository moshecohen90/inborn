# Round 134Q: Android photo-pack dead end (F463) and meter crash (F462)

## F463 (HIGH): "Download the photo pack · 668 MB" on Android with Fast

**Cause.** `photoPlan` (`packages/core/src/catalog/photoPath.ts`) filtered the alternates through `available()` but
never the selected model's own path, so a missing pack this host cannot deliver was still offered as `{kind:"pack"}`.
On the phones `photoPlanHere` (`apps/mobile/src/images/vision.native.ts`) answered `available` with
`chatModelState(id)`, which only knows chat models: for `vision-qwen35-2b` it said "missing", so available.
`vision-qwen35-2b` has only an `https` delivery in the catalog, and the Android build has no INTERNET permission and
no Play asset pack for it (`app.config.ts` ALL_PACKS: only `inborn_model_vision` ↔ `vision-qwen35`).

**Change.**
1. core: the own path is offered only when every missing piece is `available`; otherwise the plan falls through to
   the cheapest offerable alternate (`switch`) or `none`. `send` is unchanged; exported shapes unchanged.
2. mobile: new `VaultStore.canDeliver(id)` (`apps/mobile/src/vault/store.ts`) = the vault's own delivery has a plan for
   the file. On Android the delivery is `PlayDelivery`, whose `plan()` (`apps/mobile/src/vault/playDelivery.ts:17`)
   is non-null only for a model with a `play-asset-pack` entry and a bound Play Core; on iOS `HttpsDelivery.plan()`
   accepts the allowed CDN host. `photoPlanHere` uses it for vision-pack ids; chat-model ids keep the old rule.
3. `installVision` on Android for a pack with no Play pack: `VaultStore.install` already returns
   `failed / no-delivery` when `delivery.plan()` is null, before any download starts. No change; now covered by a test.

**Before → after (Fast selected, Fast + Instant + Instant's projector on the phone).**
| Host | Before | After |
|---|---|---|
| Android | `pack` vision-qwen35-2b 668 MB, alt Instant 0 B | `switch` to Instant, vision-qwen35, 0 B |
| iOS | `pack` vision-qwen35-2b 668 MB, alt Instant 0 B | unchanged |
| Android, nothing else deliverable | `pack` 668 MB | `none` |

## F462 (LOW): meter tick crash

`getUidBytes` is a synchronous Expo function (not a promise); when Android's system_server died, `TrafficStats` threw
through `sample()` out of the `setInterval` tick in `AppServices.tsx` as a fatal JavascriptException.
`sample()` in `apps/mobile/src/proof/meterSource.native.ts` now catches the throw, warns once (`[meter]`) and returns
null; the tick already returns on null, so the last total is kept.

## Tests
- core `test/fixes-r117.test.ts`: own pack undeliverable + Instant ready → `switch`; undeliverable and nothing else →
  `none`; deliverable → `pack` 668 MB as before.
- mobile `src/images/photoPlanHere.test.ts` (real VaultStore + real Play/HTTPS deliveries, Platform.OS mocked):
  Android → switch to Instant; Android `installVision("fast")` → no fetch, `failed/no-delivery`; iOS → pack 668 MB.
  Reverting the `vision.native.ts` line turns the Android case red.
- mobile `src/proof/meterSource.native.test.ts`: a throwing read returns null, warns once, recovers.
- Totals: core 1560 → 1563 passed; mobile 1484 → 1488 passed. The one mobile failure
  (`test/store-copy.test.ts` reviewer_notes) fails on main as well and is untouched here.
