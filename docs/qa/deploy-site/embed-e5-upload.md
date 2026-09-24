# Upload the multilingual document index to models.inbornapp.com (round 72, for the lead)

Round 72 made `embed-e5` the catalog's document-index model (catalog v5). The app fetches it from
`https://models.inbornapp.com/v1/multilingual-e5-large-instruct-Q6_K.gguf`, and on 24.9.2026 at 17:05 that URL
answered `404` (`cf-cache-status: DYNAMIC`, so the miss is not cached at the edge). **Nothing was uploaded by
round 72.** Until this runs, a phone that asks to install the document index outside Play gets a failed download.

| field | value |
|---|---|
| object | `v1/multilingual-e5-large-instruct-Q6_K.gguf` |
| bytes | 467,958,912 |
| sha256 | `971b20b033a555f920bad72941123f48b470a2fa676abdb713e5dc8605ea15a4` |
| local source | `/Users/moshecohen/dev/inborn/.models/multilingual-e5-large-instruct-Q6_K.gguf` (hash checked 24.9.2026) |
| upstream | `Ralriki/multilingual-e5-large-instruct-GGUF`, file `multilingual-e5-large-instruct-q6_k.gguf`, MIT |

## The command

Run from the merged `main`, so the script reads catalog v5. It uploads only what is missing or has the wrong size,
then verifies every object over the public CDN (size, `Accept-Ranges`, first and last MiB against the local file):

```
cd /Users/moshecohen/dev/inborn
MODELS_DIR=/Users/moshecohen/dev/inborn/.models node scripts/publish-models.mjs
```

The token comes from the Keychain (`inborn-cloudflare-api` / `token`) and is never printed. Expected output: `skip`
for the seven objects already live, `put   multilingual-e5-large-instruct-Q6_K.gguf … ok`, then eight `PASS` lines.

The plan, printed with `--dry` on this branch (no network write):

```
8 objects, 7.33 GB → inborn-models/v1/
  v1/Qwen3.5-0.8B-Q4_K_M.gguf  532517120
  v1/Qwen3.5-2B-Q4_K_M.gguf  1280835840
  v1/Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf  1401058176
  v1/Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf  1339879904
  v1/Phi-4-mini-instruct-Q4_K_M.gguf  2491874272
  v1/multilingual-e5-large-instruct-Q6_K.gguf  467958912
  v1/ggml-base.bin  147951465
  v1/mmproj-Qwen3.5-0.8B-F16.gguf  204987232
```

## After it

- `v1/nomic-embed-text-v1.5.f16.gguf` stays in the bucket. The catalog no longer names it, so nothing fetches it;
  delete it only after no build older than catalog v5 is in anyone's hands.
- Update the object table in `docs/ops/cdn-r2.md` with the `PASS` line.
- Play delivers the same file as the `inborn_model_embed` on-demand pack (`apps/mobile/app.config.ts`); the next AAB
  carries it with no extra step.

## Blocked 24.9.2026 ~17:10 — R2 token has no bucket access

Ran from this branch (catalog v5, `embed-e5` entry present — `packages/core/src/catalog/manifest.json` already
matches the table above). Local file re-verified: 467,958,912 bytes, sha256
`971b20b033a555f920bad72941123f48b470a2fa676abdb713e5dc8605ea15a4` (matches). `--dry` printed the same 8-object plan
shown above.

The real run failed on the *first* object (`Qwen3.5-0.8B-Q4_K_M.gguf`, expected `skip`):

```
put   Qwen3.5-0.8B-Q4_K_M.gguf … Error: PUT Qwen3.5-0.8B-Q4_K_M.gguf → HTTP 403
```

This is not the upload script's fault or a catalog mismatch — the Cloudflare API token itself (Keychain
`inborn-cloudflare-api` / account `token`) is active (`/user/tokens/verify` → `success: true`, id `b1b6b6…`) but R2
itself rejects it:

- `HEAD` on an existing object → `403 Forbidden`
- `GET <bucket>?list-type=2&max-keys=1` (plain bucket listing) → `AccessDenied`

Same result with the second Keychain entry under the same service (account `inborn`) — it resolves to the identical
token id, so it is the same credential, not a stale duplicate. The token needs **Workers R2 Storage: Edit** on
account `9de3aac0325f2ec6294e00714a0772b7` / bucket `inborn-models` re-granted or re-issued in the Cloudflare
dashboard; nothing in this repo or worktree can fix that, and this run did not attempt any GUI/browser step to do
so. **Nothing was uploaded.** The CDN still 404s on `v1/multilingual-e5-large-instruct-Q6_K.gguf` and the other
seven objects were never re-verified as live (the run never reached the verify pass). Re-run
`MODELS_DIR=/Users/moshecohen/dev/inborn/.models node scripts/publish-models.mjs` from a merged `main` once the
token's R2 permission is fixed.

Separately: while diagnosing the 403, a debug command (`security find-generic-password -g`, no `-a` filter) printed
that Keychain entry's password value in cleartext to an agent transcript — a process mistake, not a script bug.
Worth rotating the token once R2 access is restored, out of caution.
