import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, DEFAULT_OPENERS, formatModelBytes, photoPlan, type PhotoPlan } from "@inborn/core";
import { photoHoldView, switchLabel } from "../src/extensions/photoCard";
import { noPassageOpeners } from "../src/lib/docsGate";

/**
 * Round 124 (F451, and F449's app side). The web, 28.9: with Fast already installed, Instant's photo hold card offered
 * "Switch to FAST" while the paid way out reads "Switch to INSTANT · 533 MB"; the free one now says its cost too.
 * F449: a documents answer with no passage opens with a sentence the app hands the prompt in the UI language.
 */
const LOCALES = join(__dirname, "../../../packages/i18n/locales");
const locales = Object.fromEntries(readdirSync(LOCALES).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(LOCALES, f), "utf8")) as Record<string, string>]));
const en = locales.en!;
const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
const plan = (selected: string, installed: string[]) => photoPlan({ selected, models: chat, installed: (id) => installed.includes(id) }) as Exclude<PhotoPlan, { kind: "send" }>;

describe("F451 · the free way out says it is installed", () => {
  it("switchLabel on a path with nothing missing is chat.vision.switchTo, and the English says installed", () => {
    expect(switchLabel({ model: "fast", pack: "vision-qwen35-2b", missing: [], bytes: 0 }, "Fast", formatModelBytes)).toEqual({ key: "chat.vision.switchTo", params: { seer: "Fast" } });
    expect(en["chat.vision.switchTo"]).toBe("Switch to {seer} · installed");
  });

  it("the walk's card: Instant in use without its pack, Fast and Fast's pack installed", () => {
    const v = photoHoldView(plan("instant", ["instant", "fast", "vision-qwen35-2b"]), "own", null, { count: 1, model: "Instant", seer: "Fast", size: formatModelBytes });
    expect(v.secondary).toEqual({ key: "chat.vision.switchTo", params: { seer: "Fast" } });
  });

  it("every locale carries the word after the model, in the paid label's shape", () => {
    expect(Object.keys(locales).sort()).toEqual(["de", "en", "es", "fr", "ja", "ko", "pseudo", "pt-BR", "zh-Hant"]);
    for (const [name, l] of Object.entries(locales)) {
      const free = l["chat.vision.switchTo"]!;
      const paid = l["chat.vision.switchToCost"]!;
      expect(free, name).toContain("{seer}");
      expect(free, name).toContain(" · ");
      expect(free.split(" · ")[0], name).toBe(paid.split(" · ")[0]);
      expect(free.split(" · ")[1]!.replace(/~+\]$/, "").length, name).toBeGreaterThan(1);
    }
  });
});

describe("F449 · the no-passage sentence comes in the UI language", () => {
  it("English hands the prompt exactly the sentences the Instant runs measured", () => {
    expect(noPassageOpeners((k) => en[k] ?? k)).toEqual(DEFAULT_OPENERS);
  });

  it("every locale has both sentences, each one sentence ending in its own full stop", () => {
    for (const [name, l] of Object.entries(locales)) {
      for (const key of ["documents.opener.nothingRelevant", "documents.opener.nothingFits"]) {
        const s = l[key];
        expect(s, `${name} ${key}`).toBeTruthy();
        expect(s, `${name} ${key}`).not.toContain('"');
        if (name !== "pseudo") expect(s, `${name} ${key}`).toMatch(/[.。]$/);
      }
    }
  });
});

/**
 * F452. The web About read "1.0.0 (web) 91e91773d705" at HEAD e3d19aca: the web gets `Constants.expoConfig` from a
 * babel transform of expo-constants that Metro caches in $TMPDIR/metro-cache under a key without the app config, so
 * every checkout on the machine reused the config of whichever build filled that entry first.
 */
describe("F452 · the build stamp is always HEAD", () => {
  const MOBILE = join(__dirname, "..");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const buildInfo = require("../scripts/build-info.cjs") as { BUILD_INFO_FILE: string; currentBuildInfo: () => { commit: string; builtAt: string }; writeBuildInfo: (i?: { commit: string; builtAt: string }) => { commit: string; builtAt: string } };
  const head = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: MOBILE }).toString().trim();

  it("the stamp is HEAD's 12 hex and today's date", () => {
    expect(buildInfo.currentBuildInfo()).toEqual({ commit: head, builtAt: new Date().toISOString().slice(0, 10) });
  });

  it("the generated file holds it, is left alone when unchanged, and is git-ignored", () => {
    buildInfo.writeBuildInfo();
    expect(JSON.parse(readFileSync(buildInfo.BUILD_INFO_FILE, "utf8"))).toEqual(buildInfo.currentBuildInfo());
    const before = statSync(buildInfo.BUILD_INFO_FILE).mtimeMs;
    buildInfo.writeBuildInfo();
    expect(statSync(buildInfo.BUILD_INFO_FILE).mtimeMs).toBe(before);
    expect(execFileSync("git", ["check-ignore", buildInfo.BUILD_INFO_FILE], { cwd: MOBILE }).toString().trim()).toBe(buildInfo.BUILD_INFO_FILE);
  });

  it("About, Proof and the records read the generated file, and the config no longer carries the stamp", () => {
    const src = (rel: string) => readFileSync(join(MOBILE, rel), "utf8");
    expect(src("src/work/appInfo.ts")).toContain('import BUILD from "./buildInfo.generated.json";');
    for (const rel of ["src/screens/About/About.tsx", "src/screens/Proof/Proof.tsx", "src/work/appInfo.ts"]) {
      expect(src(rel), rel).not.toMatch(/extra\??\.(commit|builtAt)|expoConfig\?\.extra \?\? \{\}/);
    }
    expect(src("src/screens/About/About.tsx")).toContain("buildHash()");
    expect(src("src/screens/Proof/Proof.tsx")).toContain("builtOn()");
    const config = src("app.config.ts");
    expect(config).toMatch(/^writeBuildInfo\(\);$/m);
    expect(config).toContain("extra: { devVariant: dev },");
    expect(config).not.toContain("rev-parse");
  });

  it("the transformer's cache key follows the public app config (another variant, another key)", () => {
    const key = (variant?: string) =>
      execFileSync(process.execPath, ["-e", 'const t=require("./metro/mdTransformer.js");process.stdout.write(t.getCacheKey({projectRoot:process.cwd()}))'], { cwd: MOBILE, env: { ...process.env, APP_VARIANT: variant ?? "" }, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const release = key();
    expect(release.split(":").pop()).toMatch(/^[0-9a-f]{64}$/);
    expect(key()).toBe(release);
    expect(key("development")).not.toBe(release);
  }, 60_000);
});
