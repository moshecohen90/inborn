import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowsTestPurchases, isDevBuild, type BuildFacts } from "../src/licence/buildKind";

/**
 * F257 (security review S5). `ALLOW_TEST_PURCHASES` was `EXPO_PUBLIC_ALLOW_TEST_PURCHASES === "1" || __DEV__` and
 * `devBuild()` was `__DEV__ || EXPO_PUBLIC_DEV_MODEL_HOST !== undefined` — neither gated on anything a store build
 * could not carry by accident. Metro inlines `EXPO_PUBLIC_*` at bundle time, so one leftover export in the building
 * shell shipped a store bundle that accepts Apple sandbox and `android.test.*` proofs. `scripts/check-store-env.sh`
 * was written to catch exactly that and was called by nothing.
 */
const repo = join(__dirname, "../../..");
const facts = (o: Partial<BuildFacts> = {}): BuildFacts => ({ devBundle: false, devVariant: false, devModelHost: false, testPurchaseFlag: false, ...o });
const bools = [false, true];

describe("F257 · a store bundle cannot verify a test purchase", () => {
  it("refuses every combination of environment switches when the build is not a dev one", () => {
    /* The complement, over the whole space: with devBundle and devVariant both false, nothing else may open it. */
    for (const devModelHost of bools) {
      for (const testPurchaseFlag of bools) {
        const f = facts({ devModelHost, testPurchaseFlag });
        expect(allowsTestPurchases(f), JSON.stringify(f)).toBe(false);
        expect(isDevBuild(f), JSON.stringify(f)).toBe(false);
      }
    }
  });

  it("the switch alone is not enough: it needs the variant that was baked at build time", () => {
    expect(allowsTestPurchases(facts({ testPurchaseFlag: true }))).toBe(false);
    expect(allowsTestPurchases(facts({ devVariant: true, testPurchaseFlag: true }))).toBe(true);
  });

  it("keeps the two builds that legitimately buy: a dev bundle, and the QA release variant", () => {
    /* docs/qa/purchases-run-2026-09-11.md: a Release device build with APP_VARIANT=development and the switch set. */
    expect(allowsTestPurchases(facts({ devBundle: true }))).toBe(true);
    expect(allowsTestPurchases(facts({ devVariant: true, devModelHost: true, testPurchaseFlag: true }))).toBe(true);
    expect(isDevBuild(facts({ devVariant: true, devModelHost: true }))).toBe(true);
  });

  it("a dev host without the variant no longer makes a release bundle a dev build", () => {
    expect(isDevBuild(facts({ devModelHost: true }))).toBe(false);
  });
});

describe("F258 · the gate that was wired to nothing now refuses the build", () => {
  const script = join(repo, "scripts/check-store-env.sh");
  const run = (env: Record<string, string>) => {
    try {
      execFileSync("bash", [script], { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, out: "" };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { code: err.status, out: err.stdout };
    }
  };

  it("passes a clean shell", () => {
    expect(run({}).code).toBe(0);
  });

  it("refuses every switch on its list, one at a time", () => {
    const list = readFileSync(join(repo, "scripts/dev-switches.txt"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    expect(list).toContain("EXPO_PUBLIC_ALLOW_TEST_PURCHASES");
    expect(list.length).toBeGreaterThan(10);
    for (const v of list) {
      const r = run({ [v]: "1" });
      expect(r.code, `${v} was allowed through`).toBe(1);
      expect(r.out).toContain(v);
    }
  });

  it("the app config reads the same list, so the two gates cannot drift", () => {
    expect(readFileSync(join(repo, "apps/mobile/app.config.ts"), "utf8")).toContain("scripts/dev-switches.txt");
  });
});

describe("F259 · the app config refuses to configure a store build with a switch set", () => {
  const load = async (env: Record<string, string | undefined>) => {
    vi.resetModules();
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return (await import(/* @vite-ignore */ join(repo, "apps/mobile/app.config.ts"))) as { default: (c: { config: object }) => { extra?: { devVariant?: boolean } } };
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("throws when a release build is configured with a dev switch in the shell", async () => {
    await expect(load({ APP_VARIANT: undefined, EXPO_PUBLIC_ALLOW_TEST_PURCHASES: "1" })).rejects.toThrow(/store build refused.*EXPO_PUBLIC_ALLOW_TEST_PURCHASES/s);
    await expect(load({ APP_VARIANT: undefined, EXPO_PUBLIC_PRO: "1" })).rejects.toThrow(/store build refused/);
  });

  it("lets the development variant carry them, which is what they are for", async () => {
    const mod = await load({ APP_VARIANT: "development", EXPO_PUBLIC_ALLOW_TEST_PURCHASES: "1" });
    expect(mod.default({ config: {} }).extra?.devVariant).toBe(true);
  });

  it("bakes devVariant false into a store build, so no later variable can set it", async () => {
    const mod = await load({ APP_VARIANT: undefined, EXPO_PUBLIC_ALLOW_TEST_PURCHASES: undefined });
    expect(mod.default({ config: {} }).extra?.devVariant).toBe(false);
  });
});
