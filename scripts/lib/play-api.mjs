// Shared Android Publisher API helpers: service-account JWT auth (node:crypto, no dependencies) and a tiny JSON client.
// Credentials (never committed): INBORN_PLAY_SA_JSON=<path to service-account JSON>, or
// INBORN_PLAY_SA_KEYCHAIN=<service>:<account> for a JSON stored in the macOS Keychain (`security find-generic-password`).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

export const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
export const UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications";

export function loadServiceAccount() {
  const file = process.env.INBORN_PLAY_SA_JSON;
  const kc = process.env.INBORN_PLAY_SA_KEYCHAIN;
  let raw;
  if (file) raw = fs.readFileSync(file, "utf8");
  else if (kc) {
    const [service, account] = kc.split(":");
    raw = execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" }).trim();
  } else throw new Error("set INBORN_PLAY_SA_JSON=<service-account.json> or INBORN_PLAY_SA_KEYCHAIN=<service>:<account>");
  // A JSON pasted into the Keychain may carry literal newlines inside the private_key string.
  const sa = JSON.parse(raw.replace(/\r?\n/g, "\\n"));
  if (!sa.client_email || !sa.private_key) throw new Error("service account JSON lacks client_email/private_key");
  return sa;
}

export async function accessToken(sa) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`token: ${JSON.stringify(json)}`);
  return json.access_token;
}

export function client(token) {
  const call = async (method, url, body) => {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && body !== null ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url.replace(API, "")} → ${res.status}\n${text}`);
    return text ? JSON.parse(text) : {};
  };
  return {
    get: (u) => call("GET", u),
    post: (u, b) => call("POST", u, b),
    put: (u, b) => call("PUT", u, b),
    patch: (u, b) => call("PATCH", u, b),
    del: (u) => call("DELETE", u),
  };
}

/* Play refuses a commit with 400 "Some of the Android App Bundle uploads are not completed yet" while it is still
   ingesting a multi-GB bundle, and the caller's error path deletes the edit — which throws the finished upload away
   (vc22 lost a 5.1 GB one that way). Waiting is the whole fix: only this message is retried. */
const STILL_INGESTING = /uploads are not completed yet/i;

export async function commitEdit(api, pkg, editId, opts = {}) {
  const tries = opts.tries ?? 20;
  const waitMs = opts.waitMs ?? 60_000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});
  for (let attempt = 1; ; attempt++) {
    try {
      return await api.post(`${API}/${pkg}/edits/${editId}:commit`, null);
    } catch (e) {
      if (attempt >= tries || !STILL_INGESTING.test(String(e.message))) throw e;
      log(`commit refused while Play finishes ingesting the bundle; retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${tries})`);
      await sleep(waitMs);
    }
  }
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}
