# Play re-delivers installed on-demand packs on every app update (vc30 → vc31, 11.10.2026)

## Evidence (OnePlus 6T, read-only logcat)

- Update from the Play Store, 1.0.0 (30) → 1.0.0 (31), one tap on Update and nothing else; no Inborn code ran.
- Play (Finsky) downloaded the app's installed on-demand packs as part of the update:
  `RF: onProgress ... pkg_id=com.inbornapp.mobile artifact_id=inborn_model` (231 lines) and
  `artifact_id=inborn_model_vision_fast` (384 lines), one download `<4087:RUNNING:...13 artifacts>`, with Play's
  notification "Arquivo adicional para o app Inborn".
- This is the founder's 1.94 GB on his vc29 → vc30 update: Fast (1,280,835,840 B) and its photo pack
  (668,227,264 B) were installed, so Play brought both again. The app's old boot re-request only added to it.

## Play's documented behaviour

[Play Asset Delivery › Asset updates](https://developer.android.com/guide/playcore/asset-delivery): on an update of an
app with fast-follow or on-demand packs, "The patch for the app, including all assets, is downloaded", "All
previously-downloaded asset packs are invalidated", and "The patch for the assets is copied and applied to assets
stored in the app's internal storage". Every pack Play counts as installed is part of every update.

## Fix (branch play-forget-44)

- After a Play delivery the vault hard-links the pack files into its own directory (`files/models`, same
  filesystem as Play's `files/assetpacks`; a byte copy only if the link is refused) and loads the model from there.
- Once that copy verified (sha256 per shard), the vault calls `removePack` for every pack of the model. Play no longer
  counts the pack as installed, so no update re-downloads it and no second copy stays on disk. A refused
  `removePack` is logged and never fails the install; Remove still works on a pack Play already forgot.
- Installs made before this change move into the vault on the next launch and leave Play the same way.
- Not yet walked on a phone: the native `adoptInto` (hard link, else copy) needs a build.
