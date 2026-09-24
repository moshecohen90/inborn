#!/usr/bin/env node
// Copies the runtime files the web bundle fetches by URL (wllama wasm, the pdf.js worker) out of node_modules into
// public/, so `expo export -p web` ships them. Node rather than mkdir/cp: Tauri and pnpm run this under cmd.exe on Windows.
import { copyFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** [source under node_modules, destination under public] */
export const WEB_ASSETS = [
  ["@wllama/wllama/esm/wasm/wllama.wasm", "wllama/wllama.wasm"],
  ["@wllama/wllama-compat/wasm/wllama.js", "wllama/compat/wllama.js"],
  ["@wllama/wllama-compat/wasm/wllama.wasm", "wllama/compat/wllama.wasm"],
  ["pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs"],
];

export function copyWebAssets(appDir) {
  const copied = [];
  for (const [from, to] of WEB_ASSETS) {
    const target = join(appDir, "public", to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(appDir, "node_modules", from), target);
    copied.push(target);
  }
  return copied;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(`copied ${copyWebAssets(appDir).length} web assets into ${join(appDir, "public")}`);
}
