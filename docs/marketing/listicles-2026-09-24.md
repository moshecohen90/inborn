# Five listicle and earned-media targets, 24.9.2026 (F321)

Chosen from what the answer engines actually quoted in the probe on the same day
(`aeo-baseline-2026-09-24.md`), not from a general outreach list. Each of these URLs was cited by at least one engine
in our 72 answers, and each returned HTTP 200 when checked on 24.9.2026. Getting Inborn into these pages is how a
citation reaches ChatGPT, Gemini and Claude without waiting for our own domain to earn authority.

**Nothing here has been sent.** These are drafts for Moshe to approve. Every pitch leads with the one fact that is new
to the writer and that they can check on their own machine in a minute, because that is the only thing that gets a
reply from someone who reviews apps for a living.

The hook, in one line, for all five: **of the six on-device Android AI apps whose source we could read (PocketPal AI,
MLC Chat, Google AI Edge Gallery, SmolChat, LLM Hub, MyDeviceAI), all six declare `android.permission.INTERNET`.
Inborn's release build does not, and `aapt2 dump permissions` proves it in one command.**

**Timing:** none of these should be sent before both store listings resolve. A reviewer who cannot install the app
will not add it, and a second email later reads as a chase. The App Store version for `id6809165161` was
`PREPARE_FOR_SUBMISSION` and the Play listing was on the internal track when this was written.

---

## 1. Atomic Chat — "6 Offline AI Apps for iPhone and Android (2026)"

- **URL:** `https://atomic.chat/blog/llm-updates/offline-ai-apps-2026`
- **Route:** `support@atomic.chat` (the only address on the page)
- **Why it is first:** 12 citations in our run, and Claude quotes atomic.chat 10 times. It is a six-app list, so there
  is a seventh slot rather than a rewrite to argue for.

> Your 2026 offline-apps list is the one Claude quotes when someone asks it for a private AI app on a phone, so I am
> sending you a seventh candidate rather than a press release. Inborn is an on-device chat app for iPhone, Android,
> the browser and desktop. The part worth your minute: the Android release build declares no `INTERNET` permission at
> all, so the operating system will not let it open a connection. Run `aapt2 dump permissions inborn.apk` and the line
> is absent. I checked the six apps on your list that publish their Android source and every one of them declares it,
> which is normal, because they fetch models from Hugging Face. We ship the first model inside the app instead. Happy
> to send a build, and equally happy for you to check the claim before you decide whether it is interesting.

## 2. Local AI Master — "Run an LLM on your phone"

- **URL:** `https://localaimaster.com/blog/run-llm-on-phone`
- **Route:** `contact@localaimaster.com` (their `/contact` page, HTTP 200)
- **Why:** 12 citations, and Claude quotes localaimaster.com 7 times. The page is a how-to, so the angle is the
  measured number, not the app.

> Your phone-LLM guide is one of the pages Claude quotes when people ask what to run on a phone, and I have numbers you
> can use whether or not you mention our app. On a 2018 OnePlus 6T, Qwen3.5 0.8B at 533 MB runs at 12 to 15 tokens a
> second, the 2B at 1.28 GB runs at 5 to 6, and the 4B is too slow to use; the same 0.8B on an iPhone 13 Pro is about
> 36. Those are ours, measured on our own devices, and you are welcome to them with or without attribution. The app is
> Inborn: on-device, no account, one-time purchase, and its Android release has no `INTERNET` permission, which
> `aapt2` will confirm for you. If a "what can this phone actually run" section would help your readers, I will write
> the numbers up in whatever shape you want.

## 3. PromptQuorum — the iPhone and Android "best local LLM apps 2026" pair

- **URLs:** `https://www.promptquorum.com/power-local-llm/best-local-llm-apps-iphone-2026` and `.../best-local-llm-apps-android-2026`
- **Route:** `hello@promptquorum.com`
- **Why:** 9 citations each, 18 combined, and it is the single most-quoted domain in Claude's citation map (15) and
  high in Gemini's (18). Two pages, one email.

> You run the iPhone and the Android list that the assistants quote most often in this category, so one email for both.
> Inborn is an on-device chat app on iPhone, Android, the browser and desktop: no account, no server, one-time
> purchase, and the first model ships inside the app so the first answer needs no download. The claim I would like you
> to test rather than take from me is the Android one: the release build declares no `INTERNET` permission, so it
> cannot open a connection even in principle. Every Android app on your current lists whose source I could read
> declares it. I am not asking you to rank us above anything. I am asking you to run `aapt2 dump permissions` and
> decide whether an app that cannot reach the network belongs on a list about running models privately.

## 4. TokForge — "9 Offline AI Apps for Android and iPhone, Compared (2026)"

- **URL:** `https://tokforge.ai/guides/best-offline-ai-apps-android/`
- **Route:** `tokforge@defcon-one.io` (their site publishes it behind Cloudflare email obfuscation), or their Discord,
  `https://discord.gg/Acv3CBtfVm`
- **Why:** 8 citations. They run a leaderboard and a "can my phone run it" tool, so they are the most measurement-led
  of the five, and the most likely to check a claim rather than repeat it.

> Your comparison is the one that actually measures things, so here is a claim with a command attached. Inborn is an
> on-device AI chat app, and its Android release declares no `INTERNET` permission: `aapt2 dump permissions` on the
> APK, and the line is not there. Our build fails if it ever appears. Beyond that it is the ordinary story for your
> table: Qwen3.5 0.8B/2B/4B and Phi-4-mini in GGUF, any GGUF importable, 12 to 15 tokens a second for the 0.8B on a
> 2018 OnePlus 6T, free tier with unlimited chat, 19.99 USD once for documents and voice, no subscription. If your
> leaderboard wants a device profile from us, tell me the format and I will send the raw runs rather than a summary.

## 5. r/LocalLLaMA — the "best offline LLMs and apps for iPhone in 2026" thread

- **URL:** `https://www.reddit.com/r/LocalLLaMA/comments/1rkrrkc/best_offline_llms_and_apps_for_iphone_in_2026/`
- **Route:** a comment from Moshe's own account, flagged as the developer. Not a post, not a PR account.
- **Why:** reddit.com is Gemini's single largest citation source in our run (33 of 337). This subreddit treats
  undisclosed self-promotion badly and disclosed, technical self-promotion reasonably, so the disclosure and the
  verifiable claim are the whole message.

> I build one of these, so treat this as an interested party talking. The thing I would want to know in this thread is
> that an Android build can ship without the `INTERNET` permission at all, and almost none do, because the model comes
> from Hugging Face at first run. Ours (Inborn) ships the first model inside the app and Play delivers the larger ones
> as asset packs, so the permission is not needed and the release gate fails if it appears. `aapt2 dump permissions`
> on any of these APKs will tell you which ones can open a socket. It is the only claim in this whole category you can
> check without trusting anybody, including me.

---

## The free listings, which are not pitches

Below the five, and worth doing on launch day rather than asking permission for: an **AlternativeTo** entry (it is the
page that answers "alternative to X", and X here is PocketPal AI and Private LLM), a **Product Hunt** launch, and a
**Show HN**. None of them was cited in our run, so none of them is an AEO lever today. They are the floor, not the
work.

## How we will know any of this worked

Re-run the probe (`aeo-baseline-2026-09-24.md`) after the store listings resolve and after any of these pages
publishes. The metric is not traffic. It is whether Inborn is named in an answer, and which page the engine cites when
it names us.
