#!/usr/bin/env node
// Uploads a release AAB to a Google Play track through the Android Publisher API v3 (edits → resumable bundle upload
// → track release → commit). No dependencies: service-account JWT signed with node:crypto.
//
//   node scripts/play-upload.mjs --aab <app-release.aab> [--track internal] [--status completed|draft]
//                                [--package com.inbornapp.mobile] [--name "1.0.0 (1)"] [--dry-run]
//   node scripts/play-upload.mjs --next-version-code            # highest versionCode Play knows + 1
//
// Credentials: see scripts/lib/play-api.mjs (INBORN_PLAY_SA_JSON or INBORN_PLAY_SA_KEYCHAIN).
import fs from "node:fs";
import path from "node:path";
import { API, UPLOAD, accessToken, client, loadServiceAccount, parseArgs } from "./lib/play-api.mjs";

const CHUNK = 64 * 1024 * 1024; // must be a multiple of 256 KiB

const args = parseArgs(process.argv.slice(2));
const pkg = args.package ?? "com.inbornapp.mobile";
const track = args.track ?? "internal";
const status = args.status ?? "completed";

main().catch((e) => {
  console.error(`play-upload: ${e.message}`);
  process.exit(1);
});

async function main() {
  const token = await accessToken(loadServiceAccount());
  const api = client(token);

  if (args["next-version-code"]) {
    const edit = await api.post(`${API}/${pkg}/edits`, {});
    try {
      const { bundles = [] } = await api.get(`${API}/${pkg}/edits/${edit.id}/bundles`);
      const max = bundles.reduce((m, b) => Math.max(m, b.versionCode), 0);
      console.log(max + 1);
    } finally {
      await api.del(`${API}/${pkg}/edits/${edit.id}`);
    }
    return;
  }

  const aab = args.aab;
  if (!aab || !fs.existsSync(aab)) throw new Error("--aab <file> is required");
  const size = fs.statSync(aab).size;
  console.log(`package ${pkg}, track ${track}, status ${status}, aab ${path.basename(aab)} (${(size / 1e6).toFixed(0)} MB)`);
  if (args["dry-run"]) {
    const edit = await api.post(`${API}/${pkg}/edits`, {});
    const tracks = await api.get(`${API}/${pkg}/edits/${edit.id}/tracks`);
    await api.del(`${API}/${pkg}/edits/${edit.id}`);
    console.log("dry-run: edit opened and discarded; tracks:", tracks.tracks?.map((t) => t.track).join(", "));
    return;
  }

  const edit = await api.post(`${API}/${pkg}/edits`, {});
  console.log(`edit ${edit.id}`);
  try {
    const bundle = await uploadBundle(token, edit.id, aab, size);
    console.log(`bundle uploaded: versionCode ${bundle.versionCode}, sha256 ${bundle.sha256}`);
    const release = { name: args.name ?? String(bundle.versionCode), versionCodes: [String(bundle.versionCode)], status };
    const updated = await api.put(`${API}/${pkg}/edits/${edit.id}/tracks/${track}`, { track, releases: [release] });
    console.log(`track ${track}: ${JSON.stringify(updated.releases)}`);
    const committed = await api.post(`${API}/${pkg}/edits/${edit.id}:commit`, null);
    console.log(`committed edit ${committed.id}`);
  } catch (e) {
    await api.del(`${API}/${pkg}/edits/${edit.id}`).catch(() => {});
    throw e;
  }
}

async function uploadBundle(token, editId, file, size) {
  const start = await fetch(`${UPLOAD}/${pkg}/edits/${editId}/bundles?uploadType=resumable&ackBundleInstallationWarning=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(size),
    },
    body: "{}",
  });
  if (!start.ok) throw new Error(`resumable start ${start.status}: ${await start.text()}`);
  const session = start.headers.get("location");
  const fd = fs.openSync(file, "r");
  try {
    let offset = 0;
    while (offset < size) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      const res = await putChunk(session, buf, offset, size);
      if (res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : offset + len;
      } else if (res.ok) {
        return await res.json();
      } else {
        throw new Error(`chunk upload ${res.status}: ${await res.text()}`);
      }
      process.stdout.write(`\r  ${((offset / size) * 100).toFixed(1)}%   `);
    }
  } finally {
    fs.closeSync(fd);
    process.stdout.write("\n");
  }
  throw new Error("upload ended without a bundle response");
}

async function putChunk(session, buf, offset, size) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(session, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "Content-Range": `bytes ${offset}-${offset + buf.length - 1}/${size}` },
        body: buf,
      });
      if (res.status < 500 || attempt >= 5) return res;
      console.warn(`\n  chunk at ${offset}: ${res.status}, retrying`);
    } catch (e) {
      if (attempt >= 5) throw e;
      console.warn(`\n  chunk at ${offset}: ${e.message}, retrying`);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    // Ask the session where it is before re-sending, so a chunk Google already stored is not sent twice.
    const probe = await fetch(session, { method: "PUT", headers: { "Content-Range": `bytes */${size}` } });
    if (probe.status === 308) {
      const range = probe.headers.get("range");
      const stored = range ? Number(range.split("-")[1]) + 1 : 0;
      if (stored > offset) return probe;
    } else if (probe.ok) return probe;
  }
}




