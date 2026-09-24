import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The QA bridge presses any testID from inside the JS runtime, so it must not exist outside a build made with
 * EXPO_PUBLIC_QA=1. Two things hold that line and both are watched failing here: metro swaps the entry file for a
 * stub, and `scripts/check-qa-bridge.sh` refuses a shipping artifact that carries the sentinel anyway.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const SCRIPT = path.resolve(MOBILE, "../../scripts/check-qa-bridge.sh");
const SENTINEL = "INBORN_QA_BRIDGE_V1";
const dir = mkdtempSync(path.join(tmpdir(), "inborn-qa-gate-"));
const require_ = createRequire(import.meta.url);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const bundle = (name: string, body: string): string => {
  const file = path.join(dir, name);
  writeFileSync(file, body);
  return file;
};
const gate = (...args: string[]) => spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });

/* One line of minified JS, the shape a real main.jsbundle has. */
const RELEASE = `var __r=function(){};__d(function(){"use strict";var e="Inborn";});`;
const QA_BUILD = `${RELEASE}__d(function(){console.info("[qa] ${SENTINEL} watching Documents/qa/in")});`;

describe("check-qa-bridge.sh", () => {
  it("passes a release bundle", () => {
    const run = gate(bundle("release.jsbundle", RELEASE));
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("no QA bridge");
  });

  it("FAILS a release bundle that carries the bridge — the red this gate exists for", () => {
    const run = gate(bundle("leaked.jsbundle", QA_BUILD));
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("contains the QA bridge");
    expect(run.stdout).toContain(SENTINEL);
  });

  it("finds the bridge inside a packaged artifact, not only in a loose bundle", () => {
    const src = path.join(dir, "payload");
    const app = path.join(src, "Payload", "Inborn.app");
    spawnSync("mkdir", ["-p", app]);
    writeFileSync(path.join(app, "main.jsbundle"), QA_BUILD);
    const ipa = path.join(dir, "Inborn.ipa");
    expect(spawnSync("zip", ["-qr", ipa, "Payload"], { cwd: src }).status).toBe(0);
    expect(gate(ipa).status).toBe(1);
  });

  it("--expect-present fails on a bundle with no bridge, so a QA build cannot be mistaken for one", () => {
    expect(gate("--expect-present", bundle("release2.jsbundle", RELEASE)).status).toBe(1);
    expect(gate("--expect-present", bundle("qa.jsbundle", QA_BUILD)).status).toBe(0);
  });

  it("refuses a target that does not exist instead of passing it", () => {
    expect(gate(path.join(dir, "nothing-here.jsbundle")).status).toBe(2);
  });
});

describe("metro swaps the bridge out of every non-QA build", () => {
  const CONFIG = path.join(MOBILE, "metro.config.js");
  const BRIDGE = path.join(MOBILE, "src", "qa", "Bridge.tsx");
  const STUB = path.join(MOBILE, "src", "qa", "Bridge.stub.tsx");

  function resolveBridge(qa: boolean): string {
    const before = process.env.EXPO_PUBLIC_QA;
    if (qa) process.env.EXPO_PUBLIC_QA = "1";
    else delete process.env.EXPO_PUBLIC_QA;
    delete require_.cache[require_.resolve(CONFIG)];
    const config = require_(CONFIG) as { resolver: { resolveRequest: (c: unknown, n: string, p: string) => { type: string; filePath: string } } };
    const context = { originModulePath: path.join(MOBILE, "src", "app", "_layout.tsx"), resolveRequest: () => ({ type: "sourceFile", filePath: BRIDGE }) };
    const out = config.resolver.resolveRequest(context, "../qa/Bridge", "ios");
    if (before === undefined) delete process.env.EXPO_PUBLIC_QA;
    else process.env.EXPO_PUBLIC_QA = before;
    return out.filePath;
  }

  beforeEach(() => {
    delete require_.cache[require_.resolve(CONFIG)];
  });

  it("resolves src/qa/Bridge to the stub without EXPO_PUBLIC_QA=1", () => {
    expect(resolveBridge(false)).toBe(STUB);
  });

  it("resolves it to the real bridge with EXPO_PUBLIC_QA=1", () => {
    expect(resolveBridge(true)).toBe(BRIDGE);
  });

  it("the stub pulls in nothing, so the swap really empties the graph", () => {
    expect(readFileSync(STUB, "utf8")).not.toMatch(/\b(import|require)\b/);
  });

  it("the shell imports the bridge by the exact path the swap keys on", () => {
    expect(readFileSync(path.join(MOBILE, "src", "app", "_layout.tsx"), "utf8")).toContain('from "../qa/Bridge"');
  });
});

/**
 * The second sweep only works if both halves are wired: the bridge must ask for it after it has written the report,
 * and the driver must acknowledge the report the way it acknowledges a screenshot. Neither half has a unit under it
 * — one is a React effect on a device, the other a devicectl copy — so the wiring itself is what is watched, and
 * each check is watched failing on a sabotaged copy of the same source.
 */
describe("a cleanup step really empties the container", () => {
  const BRIDGE = readFileSync(path.join(MOBILE, "src", "qa", "Bridge.tsx"), "utf8");
  const DRIVER = readFileSync(path.resolve(MOBILE, "../../scripts/ios-qa.mjs"), "utf8");

  /** The sweep is asked for, and only after the report exists — before it, it would delete the file it waits for. */
  const sweepWired = (src: string): boolean => {
    const wrote = src.indexOf("writeResult(");
    const swept = src.indexOf("sweepAfterAck(");
    return wrote !== -1 && swept > wrote && /needsSweep\(script\.steps\)/.test(src);
  };
  const ackWired = (src: string): boolean => /Documents\/qa\/ack\/\$\{runId\}\/result\.ok/.test(src) && /op === 'cleanup'/.test(src);

  it("the bridge sweeps after it has written the report, not before", () => {
    expect(sweepWired(BRIDGE)).toBe(true);
    expect(sweepWired(BRIDGE.replace(/if \(needsSweep[^\n]*\n/, ""))).toBe(false);
    expect(sweepWired("if (needsSweep(script.steps)) await sweepAfterAck(id);\nwriteResult(id, r);")).toBe(false);
  });

  it("the driver acknowledges the report, which is what the bridge is waiting for", () => {
    expect(ackWired(DRIVER)).toBe(true);
    expect(ackWired(DRIVER.replaceAll("result.ok", "ignored.ok"))).toBe(false);
  });
});

/**
 * F299. `check-qa-bridge.sh` was run by whoever remembered: it was in no script and in no checklist, so a future
 * build that forgot it would ship the bridge and nothing would go red. It is now inside `pnpm check:store`.
 */
describe("F299 · the QA-bridge gate runs itself, over whatever the tree has built", () => {
  const REPO = path.resolve(MOBILE, "../..");
  const WRAPPER = path.join(REPO, "scripts/check-shipping-bundles.mjs");
  const run = (args: string[]) => {
    try {
      return { code: 0, out: execFileSync("node", [WRAPPER, ...args], { encoding: "utf8" }) };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { code: err.status, out: err.stdout };
    }
  };

  it("`pnpm check:store` runs it, so `pnpm test` does too", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["check:store"]).toContain("scripts/check-shipping-bundles.mjs");
    expect(pkg.scripts.test).toContain("check:store");
  });

  it("the release checklist carries it as a required line", () => {
    expect(readFileSync(path.join(REPO, "docs/qa/release-checklist.md"), "utf8")).toContain("INBORN_REQUIRE_BUNDLE=1 node scripts/check-shipping-bundles.mjs");
  });

  it("fails on an artifact that carries the bridge, and passes on one that does not", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "inborn-bundle-"));
    writeFileSync(path.join(dir, "main.jsbundle"), "var a=1;//nothing to see here\n");
    expect(run([dir]).code, "a clean artifact").toBe(0);
    writeFileSync(path.join(dir, "main.jsbundle"), `var a=1;var s="${["INBORN_QA", "BRIDGE_V1"].join("_")}";\n`);
    const red = run([dir]);
    expect(red.code, "an artifact carrying the bridge").toBe(1);
    expect(red.out).toContain("contains the QA bridge");
  });

  it("an unbuilt tree says so, and the release form refuses it", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "inborn-empty-"));
    /* No artifact path exists under a temp dir, so the wrapper's own repo paths are what is empty here. */
    expect(run([path.join(empty, "nothing")]).code).toBe(1);
  });
});
