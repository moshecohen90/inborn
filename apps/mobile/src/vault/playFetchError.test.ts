import { describe, expect, it, vi } from "vitest";

/* A sideload (and Google's review device, 12.10): `fetch` itself refuses with Play's code in the message, never a FAILED state. */
vi.mock("expo-file-system", () => ({ File: class {}, Directory: class {}, Paths: { document: { uri: "file:///doc" } } }));
vi.mock("./paths", () => ({ modelFile: () => ({ uri: "", exists: false }), safeDelete: () => undefined, vaultDir: () => ({ uri: "file:///doc/models/" }) }));
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: {},
  AssetPackErrorCode: { PACK_UNAVAILABLE: -2, API_NOT_AVAILABLE: -5, NETWORK_ERROR: -6, INSUFFICIENT_STORAGE: -10, PLAY_STORE_NOT_FOUND: -11, APP_NOT_OWNED: -13, UNRECOGNIZED_INSTALLATION: -15 },
  hasAssetPacks: () => true,
  getPackPath: () => null,
  linkInto: () => null,
  adoptInto: () => null,
  addPackListener: () => ({ remove: () => undefined }),
  fetchPack: async () => null,
  getPackState: async () => null,
  cancelPack: () => null,
  removePack: async () => undefined,
  showPackConfirmation: async () => 0,
}));

const { playFetchError } = await import("./playDelivery");

describe("playFetchError · Play's code inside a fetch rejection", () => {
  it("an installation Play does not recognise reads as Play unavailable, the same as the FAILED state would", () => {
    expect(playFetchError(new Error("-15: Asset Pack Download Error(-15): .")).message).toBe("play-unavailable");
    expect(playFetchError(new Error("-13: Asset Pack Download Error(-13): app not owned")).message).toBe("play-unavailable");
  });

  it("other codes keep their number for the card, and a message without a code passes through", () => {
    expect(playFetchError(new Error("-2: Asset Pack Download Error(-2): pack unavailable")).message).toBe("play-error--2");
    expect(playFetchError(new Error("-6: Asset Pack Download Error(-6)")).message).toBe("network");
    expect(playFetchError(new Error("failed to bind to the service")).message).toBe("failed to bind to the service");
    expect(playFetchError("boom").message).toBe("boom");
  });
});
