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
