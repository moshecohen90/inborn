# Publishing the photo pack (projector) to the CDN

Round 105 makes the browser fetch `mmproj-Qwen3.5-0.8B-F16.gguf` from
`https://models.inbornapp.com/v1/` the first time a photo needs it. Nothing in this round uploads anything.

## State on 26.9.2026

A read-only check from this machine found the file already on the CDN:

```
curl -sI -H "Origin: https://app.inbornapp.com" -H "Range: bytes=0-3" \
  https://models.inbornapp.com/v1/mmproj-Qwen3.5-0.8B-F16.gguf
HTTP/2 206
content-range: bytes 0-3/204987232
access-control-allow-origin: *
```

`scripts/publish-models.mjs` publishes every catalog model with an `https` delivery, and `vision-qwen35` has had one
since round 74, so an earlier publish run carried it. The size matches the registry (204,987,232 bytes).

## What the lead runs

1. Verify, with no credentials needed:

   ```
   node scripts/publish-models.mjs --verify-only
   ```

   Expect `PASS  mmproj-Qwen3.5-0.8B-F16.gguf  size=204987232/204987232 ranges=bytes first=206/true last=206/true`.
   It compares the first and last MiB with the local file in `.models/`.

2. Only if that line says FAIL, upload. The token comes from the Keychain service `inborn-cloudflare-api`:

   ```
   MODELS_DIR=/Users/moshecohen/dev/inborn/.models node scripts/publish-models.mjs
   ```

   It skips every object already present at the right size and puts the rest into R2 bucket `inborn-models` under
   `v1/<file>`, with the sha256 in the object metadata (`x-amz-meta-sha256`), then verifies over the public CDN.

3. Optional sha256 sidecar next to the file, for people who download it by hand. The app does not read it: the
   browser verifies against the sha256 in `/models/manifest.json`, which comes from the registry.

   ```
   printf '56e4c6cfe73b0c82e3e82bc518d7591997e61d81f723fc41a586f4fa69ea2453  mmproj-Qwen3.5-0.8B-F16.gguf\n' > /tmp/mmproj.sha256
   # upload /tmp/mmproj.sha256 as v1/mmproj-Qwen3.5-0.8B-F16.gguf.sha256 with the same S3 credentials publish-models.mjs derives
   ```

## Until it is published (any other environment)

The build points the projector at the CDN either way. A 404, or an origin that answers the SPA shell, ends the
download with "This model is not on the download server yet. Try again later." on the photo hold card, and
nothing is loaded as a projector. `web:smoke` pass 9 proves that path on a deployed-like host.
