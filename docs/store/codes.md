# Codes to create in App Store Connect and Play Console

What support hands out when someone writes in, and what the paywall's **Have a code?** row opens.
Nothing here is created by a script: both stores are a console-only job, and no tool in this repo
writes to a store. Round 64 (F306, F308).

## The one thing to know first

**Apple discontinued promo codes for In-App Purchases on 26 March 2026.** Codes you already made
stay redeemable until they expire, but App Store Connect will not create new ones. The replacement is
**offer codes**, which since the same announcement cover every In-App Purchase type, non-consumables
included — which is what Pro and Work are. So: Apple = offer codes, Play = promo codes. Sources:

- <https://developer.apple.com/news/?id=gf6mgrs6> — "Offer codes now support all In-App Purchase types,
  including consumable, non-consumable, and non-renewing subscriptions"; "starting March 26, 2026, you'll
  no longer be able to create promo codes for In-App Purchases in App Store Connect."
- <https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-offer-codes-for-in-app-purchases/>
  — limits and redemption routes.
- <https://support.google.com/googleplay/android-developer/answer/6321495> — Play promo codes: one-time
  products included, free only, 500 per quarter for everything that is not a subscription.
- <https://developer.android.com/google/play/billing/promo> — the `https://play.google.com/redeem?code=…`
  deep link and the in-app Redeem entry.

## What each store can and cannot do

| | App Store | Google Play |
|---|---|---|
| Mechanism for a one-time product | Offer codes on the IAP | Promo codes on the one-time product |
| Free (100% off) | yes | yes |
| A percentage off (20–30%) | yes, as a discounted offer price | **no** — custom discount codes are subscriptions only |
| Quantity | 10 active offers per app; up to 1M one-time-use codes per app per quarter; custom codes up to 1M shared across all IAPs | 500 codes per quarter across all non-subscription promotions |
| Per person | one code per offer | one redemption per one-time-use code |
| Redeemed by | in-app sheet, the App Store, or the code's redemption URL | in-app Redeem, the Play Store, or `https://play.google.com/redeem?code=…` |
| Sandbox rehearsal | up to 10,000 sandbox codes | no separate sandbox pool |

The consequence for support: **a cross-store "20–30% off" code does not exist on Play.** That is why
`docs/legal/terms.md` and the site's support page now promise a free code at our discretion and nothing
more, and why the only percentage the app promises is the same-store Work upgrade (`inborn.work.upgrade`,
$49.99 against $69.99, ≈29%), which is an ordinary store price, not a code.

## Create these, in this order

### App Store Connect

App Store Connect → Inborn → **In-App Purchases** → `inborn.pro` → **Offer Codes** → Create.

| # | Offer name | Code type | Price | How many | Expires | What it is for |
|---|---|---|---|---|---|---|
| 1 | `Support goodwill Pro` | one-time-use | Free | 50 | 6 months | Support answering "I bought Pro on Android and moved to iPhone", refunds we could not process, a broken purchase |
| 2 | `Press and creators Pro` | custom code `INBORNPRESS` | Free | 40 redemptions | launch + 3 months | Reviewers and creators (`docs/launch/launch-plan.md` §3) |
| 3 | `Sandbox Pro` | sandbox | Free | 20 | — | Rehearsing the redemption flow before either of the above is handed out |

Repeat #1 with 10 codes on `inborn.work` for the professional tier. Do **not** create an offer on
`inborn.pro.launch`: the launch SKU is already the discounted price, and a code on top of it is a
discount on a discount nobody asked for.

### Play Console

Play Console → Inborn → **Monetise with Play** → **Promotions** → **Promo codes** → Create promotion,
product type **One-time product**.

| # | Promotion name | Code type | Product | How many | Expires | What it is for |
|---|---|---|---|---|---|---|
| 1 | `Support goodwill Pro` | one-time use | `inborn.pro` | 50 | 6 months | The same support cases as Apple #1 |
| 2 | `Press and creators Pro` | one-time use | `inborn.pro` | 40 | launch + 3 months | Reviewers and creators |
| 3 | `Support goodwill Work` | one-time use | `inborn.work` | 10 | 6 months | Work buyers who hit a broken purchase |

That is 100 of the 500 per quarter, so three more rounds fit in the same quarter if launch needs them.
Play gives no percentage option here, so every one of these is a free unlock; hand them out accordingly.

## Handing one out

1. The person writes in with a store receipt (order ID, date, the app name on it).
2. Check the receipt belongs to Inborn and to the other store. There is no account to look them up by,
   so the receipt is the whole evidence.
3. Send one code from the goodwill batch for the store they are moving **to**, with the redemption route:
   Apple → the offer's redemption URL or App Store → account → Redeem; Play → the in-app
   **Have a code?** row, or `https://play.google.com/redeem?code=…`.
4. Log it in the ASO ledger with the date and what it was for. A batch that runs out mid-quarter is a
   signal to check what keeps going wrong, not a reason to create a bigger batch.

## What the app does

The paywall shows **Have a code?** next to **Restore** on native builds that have a store. It opens the
store's own redemption screen (`openRedeemOfferCode`, `apps/mobile/src/licence/provider.native.ts`) and
nothing else: we never see, store or validate a code, and the unlock arrives as an ordinary signed
purchase. The browser build and the licence-key build do not show the row, because neither has that
screen. Spec §12.4.1.
