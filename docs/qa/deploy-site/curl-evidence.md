# Deploy to inbornapp.com — what the API token can and cannot do, 23.9.2026

> **Superseded 24.9.2026: both origins are live.** This file is the record of the blocked state and of exactly
> which permission was missing. What was done about it, and every live response: `live-2026-09-24.md`.

**Nothing is live.** `inbornapp.com` and `app.inbornapp.com` still do not resolve. The deploy is written, gated and
dry-run; it is blocked on one thing: the Keychain token `inborn-cloudflare-api` is **read-only on Workers**, so the
first write call is refused and there is no other path to a public origin on this zone.

Account `9de3aac0325f2ec6294e00714a0772b7`, zone `inbornapp.com` = `ef6602f264e66593cd9d21a18809258a`.
Every call below was made with that token. It was read from the Keychain into a shell variable and never printed.

## What the token is allowed to do

| Call | Status | Meaning |
|---|---|---|
| `GET /user/tokens/verify` | `200` `10000 This API Token is valid and active` | the token is live |
| `GET /zones?name=inbornapp.com` | `200` → `ef6602f264e66593cd9d21a18809258a`, `active` | Zone → Read |
| `GET /zones/{zone}/dns_records` | `200` → one record: `CNAME models.inbornapp.com → public.r2.dev`, proxied | Zone → DNS → Read |
| `POST /zones/{zone}/dns_records` (probe TXT `_probe-deploy`) | `200`, created | Zone → DNS → **Edit** |
| `DELETE /zones/{zone}/dns_records/{id}` | `200`, probe removed again | same |
| `GET /zones/{zone}/dns_records/export` | `200` | |
| `GET /accounts/{acc}` | `200` | Account → Read |
| `GET /accounts/{acc}/workers/scripts` | `200` → `[]` (no Worker exists on this account) | Workers Scripts → **Read** |
| `GET /accounts/{acc}/r2/buckets` | `200` | R2 read (not touched; out of scope) |

## What the token is refused

| Call | Status | Body |
|---|---|---|
| `PUT /accounts/{acc}/workers/scripts/inborn-site` | `403` | `No access to the specified resource.` |
| `POST /accounts/{acc}/workers/scripts/{name}/assets-upload-session` | `403` | `No access to the specified resource.` |
| `PUT` / `GET /accounts/{acc}/workers/domains` | `403` | `10000 Authentication error` |
| `GET /zones/{zone}/workers/routes` | `403` | `No access to the specified resource.` |
| `GET /zones/{zone}/workers/script` | `403` | `10000 Authentication error` |
| `GET /accounts/{acc}/workers/subdomain` | `403` | `10000 Authentication error` |
| `GET /accounts/{acc}/workers/scripts/inborn-site/subdomain` | `403` | |
| `GET /accounts/{acc}/pages/projects` | `403` | `10000 Authentication error` |
| `GET /zones/{zone}/rulesets`, `GET /accounts/{acc}/rulesets` | `403` | `9109 Unauthorized to access requested resource` |
| `GET /zones/{zone}/settings` | `403` | `9109 Unauthorized to access requested resource` |
| `GET /user/tokens/{id}` | `403` | `9109` — the token cannot read its own permission list, which is why this table exists |

The `200` on `GET /workers/scripts` is Workers Scripts **Read**. It does not imply Edit, and Edit is the permission
every write above needs.

**No workaround was attempted, and none exists here.** Workers, Pages, Workers Routes, Workers custom domains and
Rules are all refused; DNS alone cannot serve bytes. A proxied `CNAME` at the apex would need something to point at,
and the only origin on this zone is the R2 catalogue host, which this stream must not touch. No other credential was
tried, per the brief. `CLOUDFLARE_CLAUDE_LOCAL` also exists in the Keychain; README records it as zone-scoped only and
already `403` on Pages, so it is not the answer either.

## The one fix

Create a custom API token (Cloudflare dashboard → My Profile → API Tokens → Create Custom Token) with:

| Permission | Resource | Why |
|---|---|---|
| Account → **Workers Scripts** → **Edit** | this account | script upload, the static-assets upload session, **and** `PUT /accounts/{acc}/workers/domains` (Cloudflare's own docs give Workers Scripts Write as the permission that endpoint needs) |
| Zone → **DNS** → **Edit** | `inbornapp.com` | the custom-domain call writes the proxied records for the apex, `www` and `app` |
| Zone → **Zone** → **Read** | `inbornapp.com` | resolve the zone id |

Store it over the same service, so nothing else has to change:

```
security add-generic-password -U -s inborn-cloudflare-api -a inborn -w   # paste the token, do not echo it
```

Then the whole deploy is one command:

```
node scripts/deploy-cloudflare.mjs --site --app
```

The token was then polled for write access, in case it was replaced while this stream ran. First every 30 s for
12 minutes (24 probes), then every 5 minutes for **3 hours** (36 probes, 20:17 → 23:12 on 23.9.2026). All 60 probes of
`POST …/workers/scripts/{name}/assets-upload-session` returned `403`, and the token's own prefix never changed, so the
Keychain item was never replaced. The probe is the upload-session call rather than a `PUT` of a throwaway Worker
because it needs exactly the same permission and creates nothing that would have to be deleted again.
**Nothing was deployed.**

## What was proven locally, and what stays unproven

Proven:

```
SITE_ORIGIN=https://inbornapp.com APP_ORIGIN=https://app.inbornapp.com pnpm --filter @inborn/site check
  built 12 pages → dist: /404 / /proof /support /blog/why-on-device /blog/how-the-proof-works
                         /blog/choosing-a-model /blog /privacy /terms /licenses /accessibility
  ✓ 12 pages: no scripts, no external assets, no dead links, CSP present

MODELS_ORIGIN=https://models.inbornapp.com pnpm run web:build
  bundle /_expo/static/js/web/index-938fe32f43558a7541b1640f693c7594.js
         sha256 0f40da721e83dd6e2b579597cbbc3e8a70f97525c6ff8d38117bcd9e45eb0cdd (3.8 MB)
  precache 20 files, 28.6 MB; 43 files hashed into hashes.json

node scripts/deploy-cloudflare.mjs --site --app --dry-run      # builds both, then plans; no network at all
  apps/site/dist: 29 files, 0.7 MB   → inborn-site,          not_found_handling 404-page,               inbornapp.com
                                     → inborn-www-redirect,  301,                                       www.inbornapp.com
  apps/web/dist:  44 files, 28.7 MB  → inborn-app,           not_found_handling single-page-application, app.inbornapp.com
```

Both builds above are post-merge, on `origin/main` at `e270f1f` (rounds 36 and 39, which changed `apps/web/build.mjs`).

- The site is built for the real origin: `<link rel="canonical" href="https://inbornapp.com/">`, and every `<loc>` in
  `sitemap.xml` is `https://inbornapp.com/…`.
- The composer hand-off points at the app origin:
  `<form class="composer" action="https://app.inbornapp.com/" method="get" role="search">` with `name="q"`, so
  `?q=hello` arrives at `app.inbornapp.com/?q=hello`. `apps/site/dist/_headers` matches it with
  `form-action https://app.inbornapp.com` — the round-41 `form-action 'none'` would have blocked the submit.
- The app's headers are the ones the Worker has to reproduce. Served from `apps/web/dist` by `scripts/serve-web.mjs`
  on port 8931 (private to this stream; killed afterwards), `curl -D-` returned:

```
HTTP/1.1 200 OK
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; …
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cache-Control: no-cache
Content-Type: text/html; charset=utf-8
```

  `Cross-Origin-Embedder-Policy: require-corp` plus `Cross-Origin-Opener-Policy: same-origin` are what give the WASM
  engine `SharedArrayBuffer`; losing them in the move off Pages would drop the browser tier to the single-thread
  fallback. Both are in `apps/web/dist/_headers`, which the deploy uploads with the assets, and the script refuses to
  deploy a dist that has no `_headers` at all. The dev host's `connect-src` reads `'self'` above only because
  `MODELS_ORIGIN` was unset for that run; the built `_headers` carries `connect-src 'self' https://models.inbornapp.com`.

- The multipart bodies the script sends are well-formed. The upload request is built by hand rather than with
  `FormData`, because Cloudflare serves each asset with the content type of its part and Node's `FormData` picks the
  filename and type itself. Both bodies were posted at a local parser (`scratchpad`, port 8932, closed afterwards)
  which read them back with `Response.formData()`:

```
--- assets upload ---
4c4b6a3be1314ab86138bef4314dde02  file="4c4b6a3be1314ab86138bef4314dde02"  type=image/png  12B
                                  sha256(decoded)=4c4b6a3be1314ab86138bef4314dde02   <- round-trips the base64
--- script upload ---
metadata   (string)  {"compatibility_date":"2026-09-01","assets":{"jwt":"x"}}
index.mjs  file="index.mjs"  type=application/javascript+module  19B
```

Unproven, and it cannot be proven until the token is replaced:

- Every live `curl` the brief asks for. `/`, `/privacy`, `/accessibility`, `/sitemap.xml`, `/llms.txt` on
  `inbornapp.com`, the app shell on `app.inbornapp.com`, the `www` → apex 301. Today both hostnames are NXDOMAIN
  (`curl` exits 6, status `000`); `inborn-site.pages.dev` does not exist either.
- That Workers static assets applies `_headers` and `not_found_handling` the way Cloudflare documents it. The
  behaviour is documented, not observed here.
- Extensionless URLs. The site writes `privacy.html`, and `/privacy` resolving to it is `html_handling:
  "auto-trailing-slash"` doing its job. Every legal button in the app and every footer link depends on it, so it is
  the **first** thing to curl after the deploy.
