# The model CDN: Cloudflare R2 behind models.inbornapp.com

The catalog's `https` delivery is the only network path the app has outside the stores
(`packages/core/src/catalog/manifest.json`, `baseUrl` `https://models.inbornapp.com/v1`). The host is compiled into
the app's allowlist (`ALLOWED_MODEL_HOSTS` in `packages/core/src/catalog/manifest.ts`), so this bucket and this
hostname are not an implementation detail that can be swapped at run time: changing either needs an app update.

## State, 22.9.2026: live

The bucket exists, the domain answers, and all eight objects verify. `node scripts/publish-models.mjs --verify-only`
is the one command that re-proves it; it exits non-zero on any failure. Both client tiers have pulled a real model
through it end to end: the browser (`pnpm web:smoke`, below) and Moshe's iPhone
(`docs/qa/cdn-iphone-2026-09-22.md`).

| object | bytes | checked |
|---|---|---|
| `v1/Qwen3.5-0.8B-Q4_K_M.gguf` | 532,517,120 | size, ranges |
| `v1/Qwen3.5-2B-Q4_K_M.gguf` | 1,280,835,840 | size, ranges |
| `v1/Qwen3.5-4B-Q4_K_M-00001-of-00002.gguf` | 1,401,058,176 | size, ranges |
| `v1/Qwen3.5-4B-Q4_K_M-00002-of-00002.gguf` | 1,339,879,904 | size, ranges |
| `v1/Phi-4-mini-instruct-Q4_K_M.gguf` | 2,491,874,272 | size, ranges |
| `v1/nomic-embed-text-v1.5.f16.gguf` | 274,290,560 | size, ranges; out of the catalog since v5 (round 72) |
| `v1/multilingual-e5-large-instruct-Q6_K.gguf` | 467,958,912 | **not uploaded yet**: catalog v5 names it, `docs/qa/deploy-site/embed-e5-upload.md` has the command |
| `v1/ggml-base.bin` | 147,951,465 | size, ranges, full sha256 |
| `v1/mmproj-Qwen3.5-0.8B-F16.gguf` | 204,987,232 | size, ranges, full sha256 |

"ranges" means `Accept-Ranges: bytes` plus a ranged `GET` of the first and last MiB whose sha256 equals the same
slice of the local file. CORS is proven the way the browser uses it: a cross-origin ranged `GET` returns 206 with
`Content-Range` and `Access-Control-Expose-Headers`, and the `OPTIONS` preflight returns `GET, HEAD` and `range`.

Two traps found while standing it up, both fixed here:

- **A HEAD to the CDN before the upload caches the 404.** The verification pass then reads that cached miss and
  calls a perfectly good object a failure. The existence check asks R2 over the S3 endpoint instead.
- **The web tier's origin allowlist was empty.** `ALLOWED_MODEL_ORIGINS` in `apps/mobile/src/web/boot.ts` was `[]`
  "until the catalog host exists", so the browser dropped every CDN model without a word and fell back to the dev
  model. It now derives from `ALLOWED_MODEL_HOSTS`, the same list the native tiers compile in.

- **A finished download could still be called a failure.** OPFS publishes a closed file asynchronously, and the two
  waits for it (`awaitPublished` in the worker, `readyModelStatus` in the door) together allowed only about four
  seconds. A 533 MB file on a loaded machine outran that once in three runs against the real CDN, and the door showed
  "stored file does not match" after the bytes and the hash were already correct. Both budgets are now twenty seconds;
  they cost nothing when the file is already visible. Three consecutive `web:smoke` runs pass since.

The iOS **simulator** cannot finish a vault download and this is not ours to fix: its `nsurlsessiond` refuses the
app's background session with `Process with pid N does not have a bundle ID, rejecting connection`
(`NSCocoaErrorDomain 4097`), whether the app is launched by `simctl` or from the home screen, and across a full
simulator reboot. The app gets as far as opening a TLS connection to the right catalog URL. A real device is the
only place that path completes — **and it does**: on 22.9.2026 the iPhone 13 Pro running build 11 pulled the 1.2 GB
Fast model from this CDN in 151 s (8.5 MB/s), passed its own sha256 check against the signed catalog, loaded the
model and answered with it. Full run and screenshots: `docs/qa/cdn-iphone-2026-09-22.md`.

One thing to know before driving that flow again: **the app activates a model the moment it finishes installing**, so
the vault label goes straight to `Loaded`, never `Installed`, and the `use-<id>` button is gone by the time a driver
looks for it. A step file that waits for `Installed` will wait forever on a download that already succeeded.

## What is where

| | |
|---|---|
| Cloudflare account | `9de3aac0325f2ec6294e00714a0772b7` (the same account as every other app domain) |
| Zone | `inbornapp.com`, id `ef6602f264e66593cd9d21a18809258a` |
| Bucket | `inborn-models`, location hint `weur` |
| Public hostname | `models.inbornapp.com` (R2 custom domain; Cloudflare writes the DNS record and the certificate) |
| Key layout | `v1/<file>` — the `v1` comes from the `baseUrl` path, the file name from each model's `https` delivery `path` |

Shards sit next to their first part (`httpsUrl()` in `manifest.ts`), so a split model is two keys in the same
directory, not a subdirectory.

## Credentials

One Cloudflare API token, in the macOS Keychain, never on disk:

```
security add-generic-password -U -s inborn-cloudflare-api -a token -w
```

It needs **Account → Workers R2 Storage: Edit**, plus **Zone → DNS: Edit** and **Zone → Zone: Read** on
`inbornapp.com` for the custom domain. The older `CLOUDFLARE_CLAUDE_LOCAL` token is zone-scoped only and returns
`Authentication error [code: 10000]` on every `/accounts/…/r2/…` path, the same way it does for Pages.

R2's S3 API takes that token directly, with no separate access keys: the **access key id is the token's id**
(`GET /client/v4/user/tokens/verify` returns it) and the **secret is the sha256 of the token string**.
`scripts/publish-models.mjs` derives both at each call, so nothing is ever written to a file or an env var.

## Bucket settings

CORS, because the web tier downloads the GGUF straight from the browser and its worker resumes with `Range`:

```json
{"rules":[{"allowed":{"origins":["*"],"methods":["GET","HEAD"],"headers":["range","content-type"]},
  "exposeHeaders":["Content-Length","Content-Range","ETag","Accept-Ranges"],"maxAgeSeconds":86400}]}
```

`Content-Range` has to be exposed explicitly (it is not a CORS-safelisted response header) or
`apps/mobile/public/model-worker.js` cannot tell a resumed 206 from a restarted 200. The web origin sends
`Cross-Origin-Embedder-Policy: require-corp`; a CORS-enabled `fetch` satisfies it, which is why the worker's
request is a plain cross-origin `fetch` and not `no-cors`.

Objects go up with `Content-Type: application/octet-stream` and an `x-amz-meta-sha256` of the catalog hash.

## Publishing and verifying

```
node scripts/publish-models.mjs --dry           # the plan: every key, every size
node scripts/publish-models.mjs                 # upload what is missing or wrong, then verify
node scripts/publish-models.mjs --verify-only   # verify what is already there
```

The plan comes from the manifest, not from a list in the script, so a new model in the catalog publishes itself.
Verification is what the app will actually do: a `HEAD` whose `Content-Length` must equal the catalog's `bytes`,
`Accept-Ranges: bytes`, and a ranged `GET` of the first and last 1 MiB whose sha256 must equal the same slice of
the local file. A file that fails any of those is a `FAIL` row and a non-zero exit.

Uploading the manifest itself is deliberately not part of this. The app reads the **bundled, signed** manifest
(`BUNDLED_MANIFEST`); nothing fetches a manifest over the network, so a copy on the CDN would be a second source
of truth with no reader.

## Cost

R2 storage is about $0.015 per GB-month and egress is free. The eight published objects are roughly 7.15 GB, so
storage is about $0.11 a month. Class A operations (the uploads) are charged per million; a full republish is
eight of them. What can grow is Class B (reads) at about $0.36 per million, which at one download per install is
noise next to the bandwidth this would cost anywhere else.

The zone is on Cloudflare's Free plan, whose edge cache refuses files over 512 MB. Five of the eight objects are
larger than that, so those are served from R2 on every request rather than from a cached copy. That costs nothing
extra here because R2 egress is free; it only means the edge is not doing the work.

## Proving the web tier against it

`scripts/serve-web.mjs` serves the dev manifest. With `MODELS_ORIGIN` set it points the model URLs at the real
catalog host instead of itself, and the same variable opens `connect-src` in the CSP:

```
MODELS_ORIGIN=https://models.inbornapp.com corepack pnpm web:build
MODELS_ORIGIN=https://models.inbornapp.com MODELS_DIR=$PWD/.models node scripts/web-smoke.mjs
```

The build needs the same variable: it writes the catalog host into the `_headers` CSP. Against the real CDN the
run downloads 533 MB into OPFS, cancels and resumes with a `Range` request, verifies the sha256, loads wllama and
answers a prompt; the second visit repeats it with the network cut and no model fetch at all.
