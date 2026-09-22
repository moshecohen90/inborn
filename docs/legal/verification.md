# What a user can verify about Inborn, and what they cannot

**Status, 22.9.2026 evening: the repository is still private, but its future is decided.** Moshe decided
the "verifiable client" claim resolves as source-available (see README "Decisions for Moshe," 18:05):
the repository goes public under the existing `LICENSE` at release, not before, and not published by any
automated stream. Until that publish actually happens, nothing the app, the store listings or the legal
documents publish may claim that the source is public, open source, or that a build can be reproduced
from it. This file lists what is true instead, so every one of those texts can be written from one place.

## Verifiable today, by anyone, with no cooperation from us

| Claim | How a user checks it themselves |
|---|---|
| The Android build cannot reach the network | Google Play → Inborn → About this app → App permissions shows no "full network access". On a computer: `adb shell dumpsys package com.inbornapp.mobile \| grep INTERNET` returns nothing. `scripts/check-android-permissions.sh` is the same check we run |
| The iOS build opens no connection by itself | Settings → Privacy & Security → App Privacy Report: no domains for Inborn, unless a model download or a Hugging Face search is running |
| Nothing leaves during a conversation | Put the device behind Little Snitch, NetGuard or Lockdown, or into airplane mode, and use the app. The Proof screen's airplane test does this in the app itself |
| No trackers are linked in | The Android build on Exodus Privacy, which analyses the shipping APK, not our word for it |
| Which model answered, and on what | The ledger under every answer, and the Proof screen's build line |

## Not verifiable today

- **That a build we publish was produced from a particular source tree.** The Proof screen shows the git
  commit of the build, which proves only that we say so. A published bundle hash that a user could
  reproduce needs a reproducible build, and we do not have one.
- **That the code does what it appears to do.** That needs the source, which is private.
- **That an independent party has examined it.** No penetration test or audit has been commissioned.

## Wording that is safe to publish while this is the state

- "You can check what the app does on the network, from outside the app, without trusting us."
- "The build identifier of the version you are running is shown in Proof."
- Never: "open source", "published core", "verify the claims in the source", "reproducible build",
  "audited", or a source link the reader cannot open.

Four texts were rewritten to this standard on 22.9.2026 (F51): `terms.md` §1, `privacy-policy.md` §10,
`packages/core/src/work/statement.ts` and the Proof screen's build section.
