# What a user can verify about Inborn, and what they cannot

**Status, 23.9.2026: the repository is public.** `github.com/moshecohen90/inborn` went public this round
(verified anonymously: `https://github.com/moshecohen90/inborn` returns 200, and the unauthenticated API
reports `"private": false`), under the existing `LICENSE`, the Inborn Source-Available Licence 1.0: it
grants the right to read the code, build and run it, compare your build against ours, and publish what you
find — not to redistribute, modify or resell it, and it is not an open-source licence. The app, the store
listings and the legal documents may now say the source is public and link to it, and must still never say
"open source" or "reproducible build": this file lists what is true, so every one of those texts can be
written from one place.

## Verifiable today, by anyone, with no cooperation from us

| Claim | How a user checks it themselves |
|---|---|
| The Android build cannot reach the network | Google Play → Inborn → About this app → App permissions shows no "full network access". On a computer: `adb shell dumpsys package com.inbornapp.mobile \| grep INTERNET` returns nothing. `scripts/check-android-permissions.sh` is the same check we run |
| The iOS build opens no connection by itself | Settings → Privacy & Security → App Privacy Report: no domains for Inborn, unless a model download or a Hugging Face search is running |
| Nothing leaves during a conversation | Put the device behind Little Snitch, NetGuard or Lockdown, or into airplane mode, and use the app. The Proof screen's airplane test does this in the app itself |
| No trackers are linked in | The Android build on Exodus Privacy, which analyses the shipping APK, not our word for it |
| Which model answered, and on what | The ledger under every answer, and the Proof screen's build line |
| What the commit the Proof screen names actually contains | Read it at `github.com/moshecohen90/inborn`, under the licence's read/build/verify grant |

## Not verifiable today

- **That a published binary was built byte-for-byte from the commit the Proof screen names.** The code at
  that commit can now be read, but reproducing our exact binary from it needs a reproducible build, and we
  do not have one, so a bundle-hash match is still not offered as evidence.
- **That an independent party has examined it.** No penetration test or audit has been commissioned.

## Wording that is safe to publish while this is the state

- "You can check what the app does on the network, from outside the app, without trusting us."
- "The build identifier of the version you are running is shown in Proof, and the commit it names is
  public."
- "The source is public at github.com/moshecohen90/inborn, under a source-available licence: read it,
  build it, publish what you find."
- Never: "open source", "reproducible build", "audited", or a claim that a published hash proves a binary
  matches the source (we do not publish one).

Four texts were rewritten to this standard on 22.9.2026 (F51): `terms.md` §1, `privacy-policy.md` §10,
`packages/core/src/work/statement.ts` and the Proof screen's build section. Updated again on 23.9.2026
(stream `site-github`) now that the repository is public: those same four texts, plus the site's header,
footer, FAQ, `/proof` and `/support` pages, and this file.
