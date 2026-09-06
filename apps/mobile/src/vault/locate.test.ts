import { describe, expect, it } from "vitest";
import { pickModelLocation } from "./locate";

const B = "file:///private/var/containers/Bundle/Application/X/Inborn.app/instant.gguf";
const D = "file:///var/mobile/Containers/Data/Application/Y/Documents/instant.gguf";
const V = "file:///var/mobile/Containers/Data/Application/Y/Documents/models/Qwen3.5-0.8B-Q4_K_M.gguf";

describe("pickModelLocation (bundled > documents > downloaded)", () => {
  it("prefers the app bundle over everything else", () => {
    expect(pickModelLocation({ bundled: B, documents: D, downloaded: V })).toEqual({ via: "bundled", path: B });
    expect(pickModelLocation({ bundled: B, downloaded: V })).toEqual({ via: "bundled", path: B });
  });

  it("prefers the hand-pushed Documents file over a download when there is no bundle", () => {
    expect(pickModelLocation({ documents: D, downloaded: V })).toEqual({ via: "dev", path: D });
    expect(pickModelLocation({ bundled: null, documents: D })).toEqual({ via: "dev", path: D });
  });

  it("falls back to the downloaded file", () => {
    expect(pickModelLocation({ downloaded: V })).toEqual({ via: "https", path: V });
    expect(pickModelLocation({ bundled: null, documents: null, downloaded: V })).toEqual({ via: "https", path: V });
  });

  it("returns null when nothing is on the device", () => {
    expect(pickModelLocation({})).toBeNull();
    expect(pickModelLocation({ bundled: null, documents: null, downloaded: null })).toBeNull();
  });
});
