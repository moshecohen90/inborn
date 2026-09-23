import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { verifyAppleJws, verifyPlayPurchase } from "@inborn/core";
import { NOW, chain, makeJws, makePlayPurchase, playPublicKeyB64, transactionPayload } from "../../../packages/core/test/licence-fixtures";

/**
 * F265. Until round 55 the QA/dev variant built under `com.inbornapp.mobile`, the store app's own bundle id, so every
 * device pass installed itself *over* the build it was meant to prove — and on 23.9 (F144) an uninstall of that same
 * id took Moshe's chats, documents and vault with it. The variant now carries `com.inbornapp.mobile.qa`, which is a
 * different iOS app: it installs beside the store build and can never replace its container.
 */
const repo = join(__dirname, "../../..");
const STORE_ID = "com.inbornapp.mobile";
const QA_ID = "com.inbornapp.mobile.qa";
/* The fixtures are signed by a test root, so it has to be an anchor; nothing else about the policy is relaxed. */
const ANCHOR = { extraRoots: [chain.root], now: NOW };

describe("F265 · the QA variant is its own app", () => {
  const load = async (variant: string | undefined) => {
    vi.resetModules();
    const saved = process.env.APP_VARIANT;
    if (variant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = variant;
    try {
      const mod = (await import(/* @vite-ignore */ join(repo, "apps/mobile/app.config.ts"))) as {
        default: (c: { config: object }) => { ios?: { bundleIdentifier?: string; buildNumber?: string }; android?: { package?: string }; name?: string };
      };
      return mod.default({ config: {} });
    } finally {
      if (saved === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = saved;
    }
  };

  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("gives the store build the store bundle id, at build 17", async () => {
    const c = await load(undefined);
    expect(c.ios?.bundleIdentifier).toBe(STORE_ID);
    expect(c.ios?.buildNumber).toBe("17");
    expect(c.name).toBe("Inborn");
  });

  it("gives the development variant a bundle id the store app can never be replaced by", async () => {
    const c = await load("development");
    expect(c.ios?.bundleIdentifier).toBe(QA_ID);
    expect(c.ios?.bundleIdentifier).not.toBe(STORE_ID);
    expect(c.name).toBe("Inborn (dev)");
  });

  it("leaves the Android package alone: Play asset packs and the 6T drivers are keyed to it", async () => {
    expect((await load(undefined)).android?.package).toBe(STORE_ID);
    expect((await load("development")).android?.package).toBe(STORE_ID);
  });
});

describe("F265 · a store build still refuses a proof issued to the QA app", () => {
  /* Watched failing: the same proof, verified under the store policy, must come back wrong-app. */
  const qaJws = makeJws({ payload: transactionPayload({ bundleId: QA_ID, environment: "Sandbox" }) });
  const storeJws = makeJws({ payload: transactionPayload({ bundleId: STORE_ID, environment: "Sandbox" }) });

  it("refuses the QA app's transaction when no bundle id is declared (the store build's call)", () => {
    const r = verifyAppleJws(qaJws, { ...ANCHOR, allowTestEnvironments: true });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("wrong-app");
  });

  it("accepts it only for a build that declares that id itself", () => {
    expect(verifyAppleJws(qaJws, { ...ANCHOR, allowTestEnvironments: true, bundleId: QA_ID }).ok).toBe(true);
    /* And the reverse: declaring the QA id does not make the store app's proof acceptable to the QA build. */
    const r = verifyAppleJws(storeJws, { ...ANCHOR, allowTestEnvironments: true, bundleId: QA_ID });
    expect(r.ok === false && r.reason).toBe("wrong-app");
  });

  it("never opens the door in a production environment, whatever id is declared", () => {
    const prod = makeJws({ payload: transactionPayload({ bundleId: QA_ID }) });
    const r = verifyAppleJws(prod, { ...ANCHOR, bundleId: QA_ID });
    expect(r.ok).toBe(true);
    /* The id is a name check, not a trust check: the chain and environment gates are what keep a store build closed. */
    const sandboxNoFlag = verifyAppleJws(qaJws, { ...ANCHOR, bundleId: QA_ID });
    expect(sandboxNoFlag.ok === false && sandboxNoFlag.reason).toBe("wrong-environment");
  });

  it("does the same for Play, where the package name is the app's identity", () => {
    const p = makePlayPurchase({ packageName: QA_ID });
    const key = playPublicKeyB64();
    const store = verifyPlayPurchase(p.json, p.signature, { publicKey: key, now: NOW });
    expect(store.ok === false && store.reason).toBe("wrong-app");
    expect(verifyPlayPurchase(p.json, p.signature, { publicKey: key, packageName: QA_ID, now: NOW }).ok).toBe(true);
  });
});

describe("F265 · verify.ts hands the verifier this build's own id, and only a QA build's", () => {
  /* The app trusts only the pinned Apple roots, so a fixture chain can never reach the bundle-id check through
     verifyProof. What has to be proven here is the wiring: which id the policy passes down, and when. */
  const seen: { bundleId?: string; allowTestEnvironments?: boolean }[] = [];

  /* The purchases harness is a Release build with APP_VARIANT=development plus both switches
     (docs/qa/purchases-run-2026-09-11.md); isDevBuild needs the model host, allowsTestPurchases the other one. */
  const loadVerify = async (bundleId: string | undefined, devVariant: boolean, switches: boolean) => {
    vi.resetModules();
    seen.length = 0;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    if (switches) {
      process.env.EXPO_PUBLIC_ALLOW_TEST_PURCHASES = "1";
      process.env.EXPO_PUBLIC_DEV_MODEL_HOST = "127.0.0.1:8999";
    } else {
      delete process.env.EXPO_PUBLIC_ALLOW_TEST_PURCHASES;
      delete process.env.EXPO_PUBLIC_DEV_MODEL_HOST;
    }
    vi.doMock("expo-constants", () => ({ default: { expoConfig: { ios: { bundleIdentifier: bundleId }, extra: { devVariant } } } }));
    vi.doMock("@inborn/core", async (orig) => {
      const real = (await orig()) as Record<string, unknown>;
      return { ...real, verifyAppleJws: (_jws: string, o: { bundleId?: string; allowTestEnvironments?: boolean }) => { seen.push(o); return { ok: false, reason: "malformed" }; } };
    });
    const mod = (await import("../src/licence/verify")) as { verifyProof: (r: unknown) => { ok: boolean } };
    mod.verifyProof({ proof: { kind: "apple-jws", jws: "a.b.c" } });
    return seen[0]!;
  };

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ALLOW_TEST_PURCHASES;
    delete process.env.EXPO_PUBLIC_DEV_MODEL_HOST;
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    vi.doUnmock("expo-constants");
    vi.doUnmock("@inborn/core");
    vi.resetModules();
  });

  it("passes the QA build's own bundle id, read from the config it was built with", async () => {
    const o = await loadVerify(QA_ID, true, true);
    expect(o.bundleId).toBe(QA_ID);
    expect(o.allowTestEnvironments).toBe(true);
  });

  it("passes no id at all from a store build, so APP_BUNDLE_ID stays the only name it accepts", async () => {
    const o = await loadVerify(STORE_ID, false, true);
    expect(o.bundleId).toBeUndefined();
    expect(o.allowTestEnvironments).toBe(false);
  });

  it("passes no id from a QA build that was not given the dev switches either", async () => {
    const o = await loadVerify(QA_ID, true, false);
    expect(o.bundleId).toBeUndefined();
    expect(o.allowTestEnvironments).toBe(false);
  });
});
