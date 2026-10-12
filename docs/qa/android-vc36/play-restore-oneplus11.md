# Play restores packs on reinstall: proof and fix on the founder's OnePlus 11 (12.10.2026)

The founder's phone (OnePlus 11, Snapdragon 8 Gen 2, 16 GB) downloaded 1.94 GB of model packs right after a fresh
install from Play, with no tap. The pack-release fix def2e36d covered app updates only; this is the install path.

## What Play does

With the founder's word, the installed 1.0.0 (30) was uninstalled and the app installed again from the Play listing
(internal test). Play served versionCode 32 from the Store's cache. One second after the base install, Play opened three
resource requests of its own, `reason=single_install`, state `POST_DOWNLOADING`, while the app process did not exist:

```
09:25:55  base installed (versionCode 32)                      pidof com.inbornapp.mobile → (empty)
09:25:56  Finsky RM: create resource request … artifact_id=inborn_model_vision reason=single_install
09:25:56  Finsky RM: create resource request … artifact_id=inborn_model_fast   reason=single_install
09:25:56  Finsky RM: create resource request … artifact_id=inborn_model        reason=single_install
          artifact sizes 156,189,952 + 1,259,387,639 + 519,450,716 = 1.93 GB
09:28:31  Cancel tapped in the Play sheet → onCancel ×3, DOWNLOAD_CANCELLED
```

The bundle declares `dist:on-demand` for every pack (`bundletool dump manifest --module …`, same config since
df81284b). Play restores, on every (re)install, the on-demand packs it once delivered to the account on that device;
1.0.0 (30) predates def2e36d and never released its packs, so Play's record of the phone still held all three. The same
restore is what the founder saw on 11.10.

## Fix (ec5467e4, shipped in 1.0.0 (36))

- The boot scan runs `PlayDelivery.dropUnrequested()` before it looks at any model: every Play pack that no record of the
  vault asked for is cancelled if in flight and taken out of Play with `removePack`; it is never adopted.
- Once per install (`VaultRecord.swept`, `PLAY_SWEEP`), the sweep calls `removePack` for every unrequested pack whatever
  Play reports, so Play's record of the device is clean and the next install brings the app alone.
- A pack still in Play's directory with no record is no longer verified and kept (`store.scan`).

`src/vault/playRestore.test.ts` covers the three cases (in flight, finished, absent).

## Proof on the phone (1.0.0 (36) from the Play listing)

| time | step | Play (logcat) | app |
|---|---|---|---|
| 09:58:23 | tap Install on the listing ("59 MB") | base 71,378,423 B + splits = 189,739,453 B | |
| 09:59:00 | versionCode 36 installed; app launched at once | states SCHEDULED → DOWNLOADING → INSTALLING → INSTALLED, no POST_DOWNLOADING, 0 pack requests | pid 12386, welcome |
| 09:59:02 | boot sweep | `AssetPackServiceImpl : removePack(…)` for all 8 packs | |
| 10:00:05 | model screen | 0 module downloads so far | "Download Instant · 738 MB" |
| 10:00:22 | tap Download Instant | `startDownload([inborn_model_vision])`, `startDownload([inborn_model])` at 10:00:25.5, the first module downloads of the install | "GOOGLE PLAY IS DELIVERING IT NOW" |
| 10:02:07 | | | "READY NOW · 533 MB · ALREADY ON THIS PHONE" |
| 10:10:22 | library photo attached, "What do you see in this photo?", Send | | |
| 10:10:59 | | | answer after 37 s: "A woman dressed as a maid holds a tray of drinks …", same pid 12386, `logcat -b crash` 0 |
| 10:13:14 | uninstall, Install again from the listing | states … → INSTALLED, **0 module downloads, 0 pack requests**; sweep again | 36, welcome |

Nothing moved before the tap; the tap that names the size is the only thing that started a download; the photo path
that crashed on this phone on 11.10 (`SIGSEGV` in `clip_image_batch_encode`, kept from the crash buffer) answers; a
reinstall after use brings the app alone.

Evidence (private, `inborn-docs/qa/oneplus11-vc35-2026-10-12/`): `logcat-session.log` (09:25–10:14),
`crash-buffer-before-uninstall.log`, `shot-01…14.png`, `dump-answer.xml`. The device's `screenrecord` left no files
(exit 0, nothing written), so the walk is documented by screenshots and logs.
