/**
 * The one definition of the web origin's security headers (spec §4.4, §14.3): the dev host (scripts/serve-web.mjs)
 * sends them, the deployable build writes them into Cloudflare Pages' `_headers`. No third-party origin anywhere.
 */

/** Model downloads may come from the catalog host (spec §5.1); everything else stays on this origin. */
export function contentSecurityPolicy(modelsOrigin = "") {
  const connect = ["'self'", modelsOrigin].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; ");
}

export const isolationHeaders = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

export function securityHeaders(modelsOrigin = "") {
  return {
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": contentSecurityPolicy(modelsOrigin),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  };
}

/** Cloudflare Pages `_headers` text: security on every path, no caching of the entry points, immutable hashed assets. */
export function pagesHeadersFile(modelsOrigin = "") {
  const all = { ...securityHeaders(modelsOrigin), ...isolationHeaders };
  const block = (path, headers) => [path, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join("\n");
  return [
    block("/*", all),
    block("/index.html", { "Cache-Control": "no-cache" }),
    block("/sw.js", { "Cache-Control": "no-cache" }),
    block("/hashes.json", { "Cache-Control": "no-cache" }),
    block("/manifest.webmanifest", { "Cache-Control": "no-cache" }),
    block("/_expo/*", { "Cache-Control": "public, max-age=31536000, immutable" }),
    block("/wllama/*", { "Cache-Control": "public, max-age=604800" }),
  ].join("\n\n") + "\n";
}
