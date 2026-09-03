# Inborn desktop (Tauri v2)

Windows and macOS ship together from the same web build of `apps/mobile` (`expo export -p web`), wrapped in a
Tauri v2 window with a Rust `llama-cpp-2` (or `llama-server` sidecar) engine behind the same `LocalLM` interface.

Status: stub. Tauri v2 needs Rust ≥ 1.77.2; this machine has cargo 1.74.1, so the shell is not generated yet.
Next step (M-desktop, spec §14.4): `rustup update stable`, then `pnpm create tauri-app` here with `frontendDist`
pointing at `../mobile/dist`, and the Rust engine crate under `src-tauri/`.

Distribution (decision D9): Windows via Microsoft Store (MSIX), macOS as a notarized DMG from the site; Mac App Store later.
