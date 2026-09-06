# Maintainer notes for the legal documents

Moved out of `privacy-policy.md` and `terms.md` (2026-09-06): the app renders those files verbatim on the Legal screen, so "delete before publishing" notes must not live inside them.

## privacy-policy.md

- Apple's definition of "collect" (transmitting data off the device in a way that lets us or partners access it beyond servicing the request) is what makes the model-download IP address non-reportable: it is sent on a server call and not retained by us. Source: https://developer.apple.com/app-store/app-privacy-details/
- Keep the domain list in section 3 in sync with the compiled allowlist in the download code (spec §5.1). If a host is added to the allowlist, it must be added here in the same release.
- Google Play requires the policy URL to be reachable from both the store listing and inside the app (spec §11.2; Play Data safety help: https://support.google.com/googleplay/android-developer/answer/10787469).
- Retention for support email (90 days) is a policy decision for Moshe; the spec says "deleted after handling".

## terms.md

- If we use Apple's standard EULA instead of these terms, the AI disclaimer (section 4) still needs to appear in the app itself (spec §10.5 #38, "can be wrong"), so keep section 4's wording as the in-app text source.
- Section 12 mirrors the minimum terms Apple requires for a custom EULA: https://www.apple.com/legal/internet-services/itunes/dev/minterms/
- The 30-day offline grace period comes from spec §12.4; keep in sync with the code.
- Governing law is a decision for Moshe with a lawyer (Israel is the natural choice; the business is Israeli). The consumer carve-out in section 13 is what makes an Israeli-law clause defensible for EU customers.
