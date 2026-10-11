import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";

/*
 * Play's confirmation dialog approves every pack waiting for it, not only the one the app asked about
 * (AssetPackManager.showConfirmationDialog). The founder's 1.94 GB came through a dialog the app opened.
 */
const WAITING_FOR_WIFI = 7;
const REQUIRES_USER_CONFIRMATION = 9;
const calls: string[] = [];
const states = new Map<string, number>();

vi.mock("expo-file-system", () => {
  class F {
    uri = "";
    exists = false;
  }
  return { File: F, Directory: F, Paths: { document: { uri: "file:///doc" } } };
});
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: { PENDING: 1, DOWNLOADING: 2, TRANSFERRING: 3, COMPLETED: 4, FAILED: 5, CANCELED: 6, WAITING_FOR_WIFI, NOT_INSTALLED: 8, REQUIRES_USER_CONFIRMATION },
  AssetPackErrorCode: {},
  hasAssetPacks: () => true,
  getPackPath: () => null,
  linkInto: () => null,
  addPackListener: () => ({ remove: () => undefined }),
  fetchPack: async (name: string) => {
    calls.push(`fetch ${name}`);
    return { name, status: REQUIRES_USER_CONFIRMATION, errorCode: 0, bytesDownloaded: 0, totalBytes: 1 };
  },
  getPackState: async (name: string) => ({ name, status: states.get(name) ?? 8, errorCode: 0, bytesDownloaded: 0, totalBytes: 1 }),
  cancelPack: (name: string) => void calls.push(`cancel ${name}`),
  removePack: async () => undefined,
  showPackConfirmation: async () => {
    calls.push("dialog");
    return 0;
  },
}));

const { PlayDelivery } = await import("./playDelivery");
const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant") as CatalogModel;
const packs = BUNDLED_MANIFEST.models.flatMap((m) => m.delivery.flatMap((d) => (d.kind === "play-asset-pack" ? [d.pack] : [])));

beforeEach(() => {
  calls.length = 0;
  states.clear();
});

describe("PlayDelivery · Play's dialog approves only what the user tapped", () => {
  it("cancels every other pack waiting for the dialog before it opens", async () => {
    states.set("inborn_model_fast", WAITING_FOR_WIFI).set("inborn_model_vision_fast", REQUIRES_USER_CONFIRMATION).set("inborn_model", REQUIRES_USER_CONFIRMATION);
    await expect(new PlayDelivery(packs).deliver(instant, () => undefined)).rejects.toThrow("canceled");
    const dialog = calls.indexOf("dialog");
    expect(dialog).toBeGreaterThan(-1);
    expect(calls.slice(0, dialog)).toEqual(expect.arrayContaining(["cancel inborn_model_fast", "cancel inborn_model_vision_fast"]));
    expect(calls).not.toContain("cancel inborn_model");
  });

  it("a request without a tap withdraws itself when Play wants a real download, and never opens the dialog", async () => {
    await expect(new PlayDelivery(packs).deliver(instant, () => undefined, { silent: true })).rejects.toThrow("canceled");
    expect(calls).toEqual(["fetch inborn_model", "cancel inborn_model"]);
  });

  it("holds a model only when Play reports every pack COMPLETED", async () => {
    const d = new PlayDelivery(packs);
    expect(await d.heldOnDevice(instant)).toBe(false);
    states.set("inborn_model", 4);
    expect(await d.heldOnDevice(instant)).toBe(true);
    states.set("inborn_model", WAITING_FOR_WIFI);
    expect(await d.heldOnDevice(instant)).toBe(false);
  });

  it("leaves a pack Play is already downloading alone: the dialog cannot approve it", async () => {
    states.set("inborn_model_fast", 2);
    await expect(new PlayDelivery(packs).deliver(instant, () => undefined)).rejects.toThrow("canceled");
    expect(calls).not.toContain("cancel inborn_model_fast");
  });
});

/* A UserTap is minted only in a screen's or a component's tap handler; a service, a boot path or a timer has none to give. */
describe("S02 guard · where a download may start", () => {
  const src = join(__dirname, "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [join(dir, n)] : []));

  it("only screens and components mint a user tap", () => {
    const minting = files(src)
      .filter((f) => /\buserTap\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(minting.filter((f) => !/^(screens|components)\//.test(f) && f !== "vault/intent.ts")).toEqual([]);
  });

  it("the vault delivers without a tap only behind Play's COMPLETED, and silently", () => {
    const store = readFileSync(join(src, "vault/store.ts"), "utf8");
    const untapped = [...store.matchAll(/^.*this\.deliverModel\(.*$/gm)].map((m) => m[0].trim()).filter((c) => !/silent: false|silent \}\)/.test(c));
    expect(untapped).toEqual(["if (await this.delivery.heldOnDevice?.(model).catch(() => false)) void this.deliverModel(model.id, { withPhotos: false, silent: true });"]);
  });
});
