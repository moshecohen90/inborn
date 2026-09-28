# Round 120 (F442): the web vault counts what it stored

## Before: main e61f222a, lead's journey walk, 28.9 14:00

Fast (1.28 GB), Instant (533 MB) and both photo packs (668 + 205 MB) were stored in OPFS, and the profile was reopened.

- `before-vault-e61f222a.png`: the vault card reads "Used in this browser: 31 MB · free: 11 GB".
- `before-privacy-storage-e61f222a.png`: Privacy & storage reads "Models … 2.69 GB".
- `navigator.storage.estimate()` returned usage 30,545,299. Of that, `usageDetails.fileSystem` was 936 bytes, the five
  `.json` sidecars. The `.gguf` files, about 2.69 GB on disk, were not counted.

## After: branch `web-storage-used`, `apps/web/dist` served by `scripts/serve-web.mjs` on 127.0.0.1:8799

Fresh chrome-headless-shell profile. The run downloaded Instant (532,517,120 bytes) in 25 s from the local models folder
(`raw/proof.mjs.txt`). In that first session Chromium did count the file: usage 563,059,646, `fileSystem` 532,517,800
(`raw/first-session-probe.json`). The under-count appears after the browser is reopened on the same profile
(`raw/relaunch.mjs.txt`, `raw/relaunch-probe.json`).

| Figure | Relaunched session |
|---|---|
| `estimate().usage` | 30,542,812 (`fileSystem` 334) |
| `estimate().quota` | 10,767,961,052 |
| OPFS files, walked | 532,517,292 (`instant.gguf` + `instant.gguf.json`) |
| What main would print | used 31 MB · free 11 GB |
| Vault card, this branch (`after-vault.png`) | Used in this browser: 533 MB · free: 10 GB |
| Privacy & storage, this branch (`after-privacy-storage.png`) | Models 533 MB |
| Fast download door, this branch (`after-door-fast.png`) | Free in this browser: 10 GB |

The vault card and Privacy & storage now print the same 533 MB. The "What main would print" row is computed from the
raw estimate, the same arithmetic main's vault card and door use. Main's build did not run in this session.

## Rule

On the web, used = the larger of `estimate().usage` and the bytes of every file in the app's OPFS directories
(`models/` and wllama's `cache/`). Free = quota minus used. Both come from `opfsModelBytes` in
`apps/mobile/src/web/opfs.ts`, the walk Privacy & storage already used. The door's space check reads the same corrected
figure. When `estimate()` is missing, used and free stay unknown.

## Tests

`apps/mobile/src/web/opfs.test.ts`: 7 tests. On e61f222a, 2 fail (`red-e61f222a.txt`). With a raw usage of 30.5 MB and
2.69 GB in OPFS, main returned usage 30,545,299 and let an 8 GB download through a 10.77 GB quota. With the fix, used
is 2.69 GB, free 8.08 GB, and the 8 GB download plus 256 MB headroom is refused. A 3 GB download fits either way, so it
cannot show the difference.
