# Developer account and brand separation

Spec basis: §3.5 (publish from the existing accounts, neutral developer name, App Transfer at gate C), §13.5 ("More by this developer" stays neutral), §15.2 gate C, §16 D10. Written 6 September 2026.

## 1. What the store developer name is, and where it shows

Apple and Google each show one **developer display name** per account, on every app the account publishes:

- App Store: under the app title on the product page ("Developer: X"), on the developer page (all apps grouped), in search result cards, and in "More by this developer" / "You might also like" rows. The name comes from the legal entity name in the Apple Developer account for organisations; individual accounts show the person's name. Changing it requires a request to Apple with documentation.
- Google Play: under the app title, on the developer page, and in "More by <name>" rows. The Play Console lets you edit the developer name freely (it must not mislead about identity and cannot impersonate another brand).

Reviews and ratings are **per app** (spec §3.5, research of 16.8), so a Bible app's rating never touches Inborn's and vice versa. What the account shares is: the name shown, the "More by" cross-listing, developer-level trust signals (account age, verification, policy history), and, for Apple, the Small Business Program threshold (all apps under the account count toward the $1M).

## 2. What this means for the existing Bible apps

The existing account today displays a name associated with the Hebrew Bible / Jewish-text apps. If Inborn ships under it unchanged:

- A privacy-conscious user tapping the developer name on Inborn's page sees a row of religious study apps. Not harmful, but off-brand for an audience recruited from r/privacy and r/LocalLLaMA, and it invites "who is behind this?" threads.
- Conversely, Bible-app users see an "AI chat" app in "More by this developer". Harmless.
- A neutral name (a company-style name that fits both product lines) removes both effects without a new account.

Renaming the account's display name changes it for the Bible apps too. That is the one real cost: their listings would show the new neutral name from that day. Their ratings, rankings and keyword positions are unaffected (the developer name is not a ranking field on either store), and store pages update within a day.

## 3. Options

| Option | Cost | Effect on Bible apps | Effect on Inborn | Verdict |
|---|---|---|---|---|
| A. Keep the current display name, publish Inborn under it | $0 | none | "More by" shows Bible apps; brand looks like a side project | acceptable but weakest brand separation |
| B. **Rename the existing account to a neutral company name** (e.g. the legal entity's name or a short neutral studio name) | $0 (Apple: a request with company documents; Play: edit in Console) | their pages show the neutral name; no ranking impact | clean, no cross-brand signal beyond a neutral studio row | **recommended (this is D10 as decided)** |
| C. New developer accounts for Inborn now | Apple $99/yr + Play $25 once, plus D-U-N-S and identity verification (Play verification deadline 30.9.2026 in the first markets, global 2027); a brand-new account has zero history and gets more scrutiny at review; a second Apple account fragments the Small Business Program | none | total separation from day one | premature; the spec defers this to gate C for a reason |
| D. Publish now under B, **App Transfer** to a dedicated entity at gate C (month 12, > $8K/month) | transfer is free on both stores; Apple keeps ratings/reviews and IAPs (transfer allowed for apps with IAP; not for apps using iCloud/Passkeys/Wallet in ways that block it — Inborn uses none) | none | separation when it is earned | the plan of record |

## 4. Recommendation

Do B now, D later, exactly as decided (D10). Concretely, before the Inborn listing is created:

1. Pick the neutral name. Constraints: must be the legal entity or a name the entity can document (Apple); not a brand of a third party; not "Inborn" (that would be the app-as-company look and would put Bible apps under an AI brand). A studio-style name derived from the legal entity works.
2. Google Play: Console › Account details › Developer name → edit. Takes effect within hours.
3. Apple: the display name for an organisation account is the legal entity name; if the entity name itself is fine, nothing to do. If a different trade name is wanted, Apple requires a request through the developer support form with documentation (DBA registration). Individual accounts cannot show a company name; if the account is individual, converting to organisation needs a D-U-N-S number and Moshe's identity.
4. Update the Bible apps' support pages/website "about" text to mention the studio name once, so a curious user finds a coherent story.
5. Keep the website (`{{DOMAIN}}`) and support email for Inborn separate from the Bible apps' domains. The privacy policy names the studio, not the Bible apps.

**Needs Moshe:** the neutral name itself, and the Apple documentation step if the display name must differ from the legal entity name. Everything else is a console edit the lead can stage.

## 5. Sources

- Apple, "Transferring an app" and eligibility: https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer
- Apple Small Business Program counts all associated accounts: https://developer.apple.com/app-store/small-business-program/
- Google Play developer name and verification: https://support.google.com/googleplay/android-developer/answer/9859152 and https://android-developers.googleblog.com/2026/06/android-developer-verification.html
