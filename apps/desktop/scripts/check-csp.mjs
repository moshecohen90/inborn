#!/usr/bin/env node
/* Desktop analogue of check-android-permissions.sh: the webview's CSP may connect only to Tauri's in-process IPC.
   Fails when any http(s)/ws host, a wildcard, or `'self'` in connect-src appears (spec §5.1: nothing leaves the device). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const conf = JSON.parse(readFileSync(join(here, "..", "src-tauri", "tauri.conf.json"), "utf8"));
const csp = conf.app?.security?.csp;
if (typeof csp !== "string" || !csp.trim()) fail("app.security.csp is missing");

const directives = Object.fromEntries(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values];
}));

const ALLOWED_CONNECT = new Set(["ipc:", "http://ipc.localhost"]);
const connect = directives["connect-src"];
if (!connect) fail("connect-src is missing (default-src 'self' would let the page fetch)");
for (const v of connect) if (!ALLOWED_CONNECT.has(v)) fail(`connect-src allows ${v}; only ${[...ALLOWED_CONNECT].join(" ")} may appear`);

for (const [name, values] of Object.entries(directives)) {
  for (const v of values) {
    if (/^(https?|wss?):\/\//.test(v) && !ALLOWED_CONNECT.has(v)) fail(`${name} names a network host: ${v}`);
    if (v === "*" || v.startsWith("*.")) fail(`${name} uses a wildcard: ${v}`);
  }
}
if (!directives["default-src"]?.includes("'self'") || directives["default-src"].length !== 1) fail("default-src must be exactly 'self'");

const updaterHosts = (conf.plugins?.updater?.endpoints ?? []).map((u) => new URL(u.replace(/\{\{[^}]+\}\}/g, "x")).host);
for (const host of updaterHosts) if (csp.includes(host)) fail(`the updater host ${host} must never appear in the webview CSP`);

console.log(`OK: webview connect-src = ${connect.join(" ")} (updater host ${updaterHosts.join(", ") || "none"} reachable only from the Rust side)`);

function fail(message) {
  console.error(`check-csp: ${message}`);
  process.exit(1);
}
