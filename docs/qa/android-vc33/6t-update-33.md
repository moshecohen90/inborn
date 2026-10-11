# 6T: update 1.0.0 (32) → 1.0.0 (33) from Play — what Play does with released packs

Device: OnePlus 6T (Android 11), Play internal track, Portuguese UI. vc33 = vc32 code (main 3837997e), built only for this check.
Driver: `update-6t-33.sh` (keyboard focus: the 6T ignores injected touches), then `restart-6t-33.sh`. Raw logs: `6t-update-33.txt`, `6t-restart-33.txt` (scratch, not committed).

## Timeline

- 21:55 Play "Atualizar" pressed (TAB ×10 + DPAD_CENTER). Base update 59.3 MB.
- 21:56:04 Finsky: `Requesting installation of asset modules: [all 8 packs]` inside the same install session as the base update, i.e. Play still treated all eight packs as installed although vc32 had called `removePack` on each of them at 19:52 (`docs/qa/android-vc32/6t-update-32.txt`, `DS: onRemove` ×8).
- 21:56:07–21:56:13 one artifact per pack, **~10 KB each** (10342…10403 B), all `RF: onSuccess` within six seconds: patches against the pack files Play still had, not downloads. **Total network for the eight packs: 83 KB.**
- 21:57 app launched (vc33). PlayCore in the app process: `PatchSliceTaskHandler: Patching and extraction finished` for fast, speech, embed, sharp_2, model (5 of 8 by 21:59:50); `AssetPackStorage: Multiple pack versions found, using highest version code`.
- 21:59:51 the vault (requestKnownPacks → heldOnDevice → silent deliver → owned → release) called `removePack` for vision, vision_fast, speech, embed, fast.
- Live free space (`dumpsys diskstats` **Data-Free**): 11,874,276 K before the update → **4,247,824 K at 21:58** (PlayCore rewriting the pack files: −7.6 GB) → 11,875,736 K at 22:03.
- 22:03–22:26 the PlayCore foreground notification **"Arquivo adicional para o app Inborn" stayed up for 22+ minutes**, extraction frozen at 5/8, no disk activity: PlayCore's extraction stalled after packs were removed under it. It cleared only when the app was force-stopped (22:26).
- 22:26 relaunch: vault `removePack(inborn_model / sharp / sharp_2)` → Finsky `removeModule for package` → PlayCore `onRemoveModule()`. Free space unchanged (the vault's hard links keep the model bytes; Play's directory entries were the only thing removed). 0 crashes.

## Conclusions

1. **No model bytes were downloaded again** (83 KB total) — the 1.94 GB Play download of round 44 did not recur for identical pack content.
2. **`removePack` in vc32 did not make Play forget the packs**: on the next update Play still "updated" all eight, rewrote ~7.6 GB on disk, showed its notification, and then stalled. Whether a removePack that was followed by an app restart (as now, 22:26) changes Play's behaviour is checked with the vc34 update (`6t-update-34.txt`).
3. A pack whose content changes would be delivered by Play on update without a tap. Until Play provably skips released packs, a shipped pack name must never change content (new content = new pack name); gate to add.
4. Correction to `docs/qa/android-vc32/6t-update-32.txt`: "App Data Sizes … unchanged" came from `dumpsys diskstats`, whose per-package sizes are a daily cache, not a live reading. The live figure is `Data-Free`; the vc32 claim is withdrawn, the hard-link behaviour itself is shown here by the free-space return to baseline after Play's copies were removed.
