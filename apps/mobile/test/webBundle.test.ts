import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * F40 (22.9.2026): the browser bundle reached `llama.rn` through `vault/index.ts`, so opening the onboarding
 * model step evaluated its TurboModule and killed the page. Metro's platform extensions are the fix
 * (`vault/resolve.web.ts`), and nothing but a graph walk notices when a new import re-opens the path.
 *
 * This walks every route under `src/app` the way Metro resolves for the web (a `.web.*` file wins) and fails
 * if a module with no react-native-web implementation is reachable.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
/* Metro's web resolution order; `.web.*` first is what keeps the native engine out of the browser. */
const EXTENSIONS = [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js"];
/* Native modules with no web implementation: reaching one from a route is the F40 bug, whatever the module. */
const NATIVE_ONLY = ["llama.rn", "whisper.rn", "expo-iap", "expo-sqlite", "expo-speech-recognition", "@fugood/react-native-audio-pcm-stream"];
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function resolveWeb(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const index = path.join(base, `index${ext}`);
      if (existsSync(index)) return index;
    }
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

function specifiers(code: string): string[] {
  const out: string[] = [];
  for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    re.lastIndex = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) if (m[1]) out.push(m[1]);
  }
  return out;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** Walks the web graph from every route; returns, per bare specifier, the chain of files that first reached it. */
function webGraph(): { files: Set<string>; reached: Map<string, string[]> } {
  const roots = filesUnder(path.join(SRC, "app")).filter((f) => /\.(ts|tsx)$/.test(f));
  const cameFrom = new Map<string, string>();
  const files = new Set<string>();
  const reached = new Map<string, string[]>();
  const chain = (file: string): string[] => {
    const out: string[] = [];
    for (let at: string | undefined = file; at; at = cameFrom.get(at)) out.unshift(path.relative(SRC, at));
    return out;
  };
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift() as string;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) {
        if (!reached.has(spec)) reached.set(spec, [...chain(file), spec]);
        continue;
      }
      const target = resolveWeb(file, spec);
      if (!target) continue;
      if (!cameFrom.has(target)) cameFrom.set(target, file);
      queue.push(target);
    }
  }
  return { files, reached };
}

describe("web bundle", () => {
  const { files, reached } = webGraph();

  it("walks the whole route graph", () => {
    expect(files.size).toBeGreaterThan(100);
  });

  it.each(NATIVE_ONLY)("never reaches %s from a route (F40)", (module) => {
    const chain = reached.get(module);
    expect(chain ? chain.join("\n  -> ") : null).toBeNull();
  });

  it("keeps the vault's engine resolver on a web variant", async () => {
    expect(existsSync(path.join(SRC, "vault/resolve.web.ts"))).toBe(true);
    const { resolveEngine } = await import("../src/vault/resolve.web");
    expect(resolveEngine()).toBeNull();
  });
});
