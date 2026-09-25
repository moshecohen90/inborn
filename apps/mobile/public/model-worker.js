/* global self, WorkerGlobalScope, AbortController, TextEncoder */
/**
 * Model delivery worker (spec §4.4, §5.1): streams one GGUF from the app's own origin (or the catalog host) into the
 * Origin Private File System, resuming with Range from whatever is already on disk, hashing as it goes.
 * Plain ES module so the browser loads it unbundled (`new Worker("/model-worker.js", { type: "module" })`) and
 * vitest imports the very same file. Nothing here may talk to any other host than the URL it was handed.
 *
 * Messages in:  { type: "download", url, file, bytes, sha256 }   { type: "abort" }
 * Messages out: { type: "progress", have, total }  { type: "done", have, sha256, verified }  { type: "paused", have }  { type: "error", message }
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/**
 * Incremental SHA-256 whose state can be exported and restored, so a resumed download keeps hashing where it stopped
 * instead of re-reading gigabytes. WebCrypto has no streaming digest.
 * @returns {{ update(bytes: Uint8Array): void, hex(): string, exportState(): { h: number[], buf: number[], total: number }, importState(s: { h: number[], buf: number[], total: number }): void, reset(): void }}
 */
export function createSha256() {
  const h = new Uint32Array(8);
  const w = new Uint32Array(64);
  const block = new Uint8Array(64);
  let blockLen = 0;
  let total = 0;

  const reset = () => {
    h.set(H0);
    blockLen = 0;
    total = 0;
  };
  reset();

  const compress = (bytes, offset) => {
    for (let i = 0; i < 16; i++, offset += 4) w[i] = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  };

  return {
    update(bytes) {
      total += bytes.length;
      let i = 0;
      if (blockLen) {
        const take = Math.min(64 - blockLen, bytes.length);
        block.set(bytes.subarray(0, take), blockLen);
        blockLen += take;
        i = take;
        if (blockLen < 64) return;
        compress(block, 0);
        blockLen = 0;
      }
      for (; i + 64 <= bytes.length; i += 64) compress(bytes, i);
      if (i < bytes.length) {
        block.set(bytes.subarray(i), 0);
        blockLen = bytes.length - i;
      }
    },
    hex() {
      const pad = new Uint8Array(blockLen < 56 ? 64 : 128);
      pad.set(block.subarray(0, blockLen));
      pad[blockLen] = 0x80;
      const bits = total * 8;
      const view = new DataView(pad.buffer);
      view.setUint32(pad.length - 8, Math.floor(bits / 0x100000000));
      view.setUint32(pad.length - 4, bits >>> 0);
      const snapshot = Uint32Array.from(h);
      for (let i = 0; i < pad.length; i += 64) compress(pad, i);
      const out = Array.from(h, (x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
      h.set(snapshot);
      return out;
    },
    exportState: () => ({ h: Array.from(h), buf: Array.from(block.subarray(0, blockLen)), total }),
    importState(s) {
      h.set(s.h);
      block.set(s.buf, 0);
      blockLen = s.buf.length;
      total = s.total;
    },
    reset,
  };
}

/** Meta file written next to a finished model; its presence with a matching size is what "ready" means. */
export const metaName = (file) => `${file}.json`;
/** Resume state (hash midstate + byte count), deleted once the file is verified. */
export const stateName = (file) => `${file}.state.json`;

const CHECKPOINT_BYTES = 32 * 1024 * 1024;
const PROGRESS_MS = 150;

/**
 * Decides how a fetch response continues an existing partial file.
 * @param {number} have bytes already on disk
 * @param {number} status HTTP status
 * @param {string|null} contentRange
 * @param {string|null} contentLength
 * @returns {{ restart: boolean, total: number|null }}
 */
export function planResponse(have, status, contentRange, contentLength) {
  const length = contentLength ? Number(contentLength) : null;
  if (status === 206) {
    const m = /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(contentRange ?? "");
    if (!m || Number(m[1]) !== have) return { restart: true, total: null };
    return { restart: false, total: m[3] === "*" ? (length === null ? null : have + length) : Number(m[3]) };
  }
  if (status === 200) return { restart: have > 0, total: length };
  throw new Error(`HTTP ${status}`);
}

const GGUF_MAGIC = [0x47, 0x47, 0x55, 0x46];

/**
 * A static host answers a file it lacks with its SPA shell (200 text/html); that must fail, never become a "model".
 * @param {string} file
 * @param {string|null} contentType
 * @param {Uint8Array|null} head the first bytes of the file, when the download starts at byte 0
 */
export function assertModelBytes(file, contentType, head) {
  if (/text\/html/i.test(contentType ?? "")) throw new Error(`not a model file: the server answered ${contentType} for ${file}`);
  if (head && file.endsWith(".gguf") && GGUF_MAGIC.some((b, i) => head[i] !== b)) {
    throw new Error(`not a model file: ${file} does not start with GGUF (got '${String.fromCharCode(...head.subarray(0, 4))}')`);
  }
}

async function readJson(dir, name) {
  try {
    const handle = await dir.getFileHandle(name);
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

async function writeJson(dir, name, value) {
  const handle = await dir.getFileHandle(name, { create: true });
  const access = await handle.createSyncAccessHandle();
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    access.truncate(0);
    access.write(bytes, { at: 0 });
    access.flush();
  } finally {
    await access.close();
  }
}

const removeQuietly = (dir, name) => dir.removeEntry(name).catch(() => undefined);

/**
 * Waits until a file this worker closed is readable at its full size from a fresh handle. Closing a sync access handle
 * publishes the bytes asynchronously, and the page terminates this worker the moment it hears "done", so the wait
 * belongs here rather than in the door, which would otherwise read a file that is not there yet (QA F22).
 * @returns {Promise<boolean>} false when it never became visible in time; the caller still reports what it wrote.
 */
export async function awaitPublished(dir, file, bytes, tries = 400, delayMs = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await (await dir.getFileHandle(file)).getFile()).size === bytes) return true;
    } catch {
      /* not published yet, or the lock is still coming down */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Downloads `url` into OPFS `models/<file>`, resuming a partial file, verifying sha256 when one is given.
 * @param {{ url: string, file: string, bytes?: number, sha256?: string }} job
 * @param {(m: object) => void} post
 * @param {AbortSignal} signal
 */
export async function download(job, post, signal) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("models", { create: true });
  const handle = await dir.getFileHandle(job.file, { create: true });
  const access = await handle.createSyncAccessHandle();
  const hasher = createSha256();
  let have = access.getSize();
  let lastCheckpoint = have;
  let lastProgress = 0;
  let open = true;
  /* Everything this file wrote becomes visible to getFile() only once the access handle is closed, so closing is part of finishing, not of cleanup. */
  const closeAccess = async () => {
    if (!open) return;
    open = false;
    await access.close();
  };
  const saveState = () => writeJson(dir, stateName(job.file), { url: job.url, have, hash: hasher.exportState() });

  try {
    const state = await readJson(dir, stateName(job.file));
    if (have > 0 && state && state.url === job.url && state.have === have && state.hash) {
      hasher.importState(state.hash);
    } else if (have > 0) {
      /* No usable midstate: hash what is on disk before continuing. */
      const buf = new Uint8Array(4 * 1024 * 1024);
      for (let at = 0; at < have; at += buf.length) {
        const n = access.read(buf, { at });
        hasher.update(buf.subarray(0, n));
      }
    }

    const headers = have > 0 ? { Range: `bytes=${have}-` } : {};
    const res = await fetch(job.url, { headers, signal, cache: "no-store", credentials: "omit" });
    const plan = planResponse(have, res.status, res.headers.get("content-range"), res.headers.get("content-length"));
    assertModelBytes(job.file, res.headers.get("content-type"), null);
    if (plan.restart) {
      access.truncate(0);
      have = 0;
      lastCheckpoint = 0;
      hasher.reset();
    }
    const total = plan.total ?? job.bytes ?? null;
    if (job.bytes && total !== null && total !== job.bytes) throw new Error(`size mismatch: server ${total} bytes, manifest ${job.bytes}`);
    if (!res.body) throw new Error("empty response body");

    const reader = res.body.getReader();
    let head = have === 0 ? new Uint8Array(0) : null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (head && head.length < 4) {
        const joined = new Uint8Array(head.length + value.length);
        joined.set(head, 0);
        joined.set(value, head.length);
        head = joined.subarray(0, 4);
        if (head.length === 4) assertModelBytes(job.file, null, head);
      }
      access.write(value, { at: have });
      hasher.update(value);
      have += value.byteLength;
      const now = Date.now();
      if (now - lastProgress > PROGRESS_MS) {
        lastProgress = now;
        post({ type: "progress", have, total });
      }
      if (have - lastCheckpoint >= CHECKPOINT_BYTES) {
        access.flush();
        await saveState();
        lastCheckpoint = have;
      }
    }
    access.flush();
    if (head && head.length < 4) assertModelBytes(job.file, null, head);
    if (total !== null && have !== total) throw new Error(`incomplete: ${have} of ${total} bytes`);
    const digest = hasher.hex();
    if (job.sha256 && digest !== job.sha256.toLowerCase()) {
      access.truncate(0);
      access.flush();
      throw new Error("checksum mismatch: the file on this origin is not the one in the manifest");
    }
    /* The meta file is the "ready" marker, so it may only be written once the model file itself is closed and visible at its full size. */
    await closeAccess();
    await awaitPublished(dir, job.file, have);
    await writeJson(dir, metaName(job.file), { url: job.url, bytes: have, sha256: digest, verified: !!job.sha256, at: new Date().toISOString() });
    await removeQuietly(dir, stateName(job.file));
    post({ type: "done", have, sha256: digest, verified: !!job.sha256 });
  } catch (e) {
    if (open) access.flush();
    /* Same reason as the success path: the resume state must describe a file whose bytes are already committed. */
    await closeAccess();
    if (signal.aborted) {
      await saveState();
      post({ type: "paused", have });
    } else {
      if (/^not a model file/.test(e instanceof Error ? e.message : "")) {
        await removeQuietly(dir, job.file);
        await removeQuietly(dir, stateName(job.file));
      } else {
        await removeQuietly(dir, stateName(job.file)).then(() => (have > 0 ? saveState() : undefined));
      }
      post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    await closeAccess();
  }
}

if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  let controller = null;
  self.onmessage = (e) => {
    const m = e.data;
    if (m?.type === "abort") controller?.abort();
    if (m?.type !== "download") return;
    controller = new AbortController();
    const signal = controller.signal;
    download(m, (msg) => self.postMessage(msg), signal).catch((err) => self.postMessage({ type: "error", message: String(err?.message ?? err) }));
  };
}
