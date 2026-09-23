# Live Whisper transcript on the 6T — attempted with Moshe at the phone, 22.9.2026 10:53–11:09

The one Android row that has never run: a real Whisper transcript, spoken by a person into the store build. Every
earlier attempt was headless, and a headless run has nobody to speak, so the voice-activity detector never hands
Whisper a segment. This run put the phone in its listening state with Moshe beside it.

**Outcome: still NOT RUN. No speech ever reached the microphone**, so Whisper was never asked to decode anything.
What this run does add is the far longer microphone-stability proof below, and the reason the earlier windows kept
closing.

## What was under test

Play release **1.0.0 (15)**, versionCode 15, `com.inbornapp.mobile`, installed by `com.android.vending`, all seven
asset packs present, speech pack = `ggml-base.bin` (Whisper base). `adb -s <6t-serial>`, keys only, one driver process,
every `uiautomator dump` serialised behind one lock directory.

`RECORD_AUDIO` was granted with `pm grant` at 10:53 for the measurement and **revoked again afterwards**. The app was
force-stopped and relaunched so the process started holding the permission, then `inborn://voice` opened the
hands-free screen. One pid, **9339**, for the whole run.

## The screen was genuinely listening

`live-whisper-listening.png` (11:03) is the live hands-free screen on the release build: green ring, **LISTENING**,
"Say something. Everything stays on this phone.", "Tap when you are done speaking", **ALL ON THIS PHONE** and the
resident model **INSTANT**, with Android's own microphone indicator lit in the status bar. `dumpsys power` read
`mWakefulness=Awake` and `Display Power: state=ON`, and `mCurrentFocus` was Inborn's `MainActivity`, so the screen was
awake and in front the whole time. **The waveform stayed flat at every poll** — the microphone was open and hearing
nothing.

The vault resolved Whisper inside the Play speech pack, as on vc13:

```
09-22 10:53:44.858 D/RNWhisper( 9339): Loaded native library: rnwhisper_v8fp16_va_2
```

## The screen gives up after about 40 seconds of silence

This is what closed the first window before anyone could speak, and it is worth knowing before the next attempt. With
no sound at all, the reducer reaches its silence ceiling in **roughly 40 s**, shows **ENDED** with "Ended. Nothing was
heard for a while.", and stops listening. **The ENDED screen offers no way back**: its only nodes are `voice-screen`,
`voice-seal`, `voice-phase`, `voice-note` and `voice-end` ("End"). Re-entering means BACK once and then
`inborn://voice` again.

The driver therefore re-opened the screen automatically on every ENDED, which kept the phone continuously listening
for the rest of the run: **9 silence timeouts, 10 re-opens**, no gap longer than about 15 s.

## F35 at 57 microphone cycles, ten times vc13's proof

vc13 proved the round-18 microphone fix over five open/close cycles in 136 s. This run held the same pid through a
quarter of an hour of continuous listening:

| measure | value |
|---|---|
| pid | **9339**, unchanged from 10:53:44 to 11:09:39 |
| microphone open/close cycles | **57** `AudioRecord set()` and 57 `start()` |
| `FATAL EXCEPTION` | **0** |
| `AudioRecord.release` | **0** |
| app-scoped log lines | 13,855 |

On vc11 and vc12 the third microphone open killed the app about 24 s in, every time. Fifty-seven clean cycles across ten
screen re-entries is the strongest evidence so far that F35 is closed on the shipping build.

## What is still not proven

**Whisper turning speech into text.** Nothing was spoken into the phone during the window, the waveform never moved,
and there is **no `whisper_full`, no decode and no transcript line anywhere in the 13,855 captured lines**. There is
consequently no transcript to compare against what was said, and no decode timing. This row stays open and still
needs a person to speak into the 6T while the screen reads LISTENING.

**How to run it next time.** Grant the microphone, launch, open `inborn://voice`, confirm the screen reads LISTENING,
and speak **within about 40 s** — or keep the re-open loop running, which removes the deadline entirely. Speak close
to the phone: the microphone here registered nothing at all from across a room.

## The phone at the end

`RECORD_AUDIO` is `granted=false` again, as the run found it; revoking it restarts the app process, which Android
always does for a runtime-permission change and which is not a crash. The app was relaunched to its chat and then left
as section R left it, force-stopped with the phone on its launcher. Nothing was installed or uninstalled, no phone
setting was changed, and the phone was never locked or unlocked.
