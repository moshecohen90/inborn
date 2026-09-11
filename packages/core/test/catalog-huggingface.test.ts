import { describe, expect, it } from "vitest";
import { hfDisplayName, hfFileAsModel, hfRepoInfoUrl, hfResolveUrl, hfSearchUrl, hfVaultFileName, isHfModelId, paramsOf, parseHfRepoInfo, parseHfSearch, quantOf, ramNeedGB, requestBytes } from "../src/catalog/huggingface";
import { httpsUrl, BUNDLED_MANIFEST } from "../src/catalog/manifest";

const search = [
  { _id: "1", id: "unsloth/Qwen3-0.6B-GGUF", likes: 140, private: false, downloads: 93729, gated: false, lastModified: "2025-06-23T00:26:15.000Z" },
  { _id: "2", id: "google/gemma-3-1b-it-qat-q4_0-gguf", likes: 1, downloads: 5, gated: "auto" },
  { _id: "3", id: "someone/private", private: true, downloads: 1 },
  { id: 42 },
];

const info = {
  id: "unsloth/Qwen3-0.6B-GGUF",
  gated: false,
  cardData: { license: "apache-2.0" },
  gguf: { architecture: "qwen3", context_length: 40960 },
  siblings: [
    { rfilename: ".gitattributes", size: 3135 },
    { rfilename: "Qwen3-0.6B-BF16.gguf", size: 1198182848, lfs: { sha256: "f9c9f1d3c1e21755b82d4e165f88dbbbd4355646d632fb5d6cef7c66ed4ee04e", size: 1198182848 } },
    { rfilename: "Qwen3-0.6B-IQ4_NL.gguf", size: 381566656, lfs: { sha256: "F1B14E28A6DE64F21672DDF2C8F24736C389DA4C64EBF024B1204F4F43A4FD71", size: 381566656 } },
    { rfilename: "mmproj-F16.gguf", size: 100, lfs: { sha256: "a".repeat(64), size: 100 } },
    { rfilename: "Qwen3-0.6B-Q8_0-00001-of-00002.gguf", size: 100, lfs: { sha256: "b".repeat(64), size: 100 } },
    { rfilename: "Qwen3-0.6B-Q4_K_M.gguf", size: 397, lfs: {} },
    { rfilename: "README.md", size: 10 },
  ],
};

describe("Hugging Face search (spec §7.2)", () => {
  it("URLs stay on huggingface.co and encode the repo", () => {
    expect(hfSearchUrl(" qwen3 ")).toBe("https://huggingface.co/api/models?search=qwen3&filter=gguf&sort=downloads&direction=-1&limit=20&expand[]=gated&expand[]=downloads&expand[]=likes&expand[]=lastModified");
    expect(hfRepoInfoUrl("unsloth/Qwen3-0.6B-GGUF")).toBe("https://huggingface.co/api/models/unsloth/Qwen3-0.6B-GGUF?blobs=true");
    expect(hfResolveUrl("a b/c", "dir/x y.gguf")).toBe("https://huggingface.co/a%20b/c/resolve/main/dir/x%20y.gguf");
  });

  it("parses search results and skips private or malformed rows", () => {
    expect(parseHfSearch(search)).toEqual([
      { id: "unsloth/Qwen3-0.6B-GGUF", downloads: 93729, likes: 140, gated: false, updatedAt: "2025-06-23T00:26:15.000Z" },
      { id: "google/gemma-3-1b-it-qat-q4_0-gguf", downloads: 5, likes: 1, gated: true, updatedAt: null },
    ]);
    expect(parseHfSearch({ error: "x" })).toEqual([]);
  });

  it("lists only whole GGUF files that carry a SHA-256, smallest first", () => {
    const r = parseHfRepoInfo(info)!;
    expect(r.id).toBe("unsloth/Qwen3-0.6B-GGUF");
    expect(r.license).toBe("apache-2.0");
    expect(r.arch).toBe("qwen3");
    expect(r.contextLength).toBe(40960);
    expect(r.files.map((f) => f.path)).toEqual(["Qwen3-0.6B-IQ4_NL.gguf", "Qwen3-0.6B-BF16.gguf"]);
    expect(r.files[0]).toEqual({ path: "Qwen3-0.6B-IQ4_NL.gguf", bytes: 381566656, sha256: "f1b14e28a6de64f21672ddf2c8f24736c389da4c64ebf024b1204f4f43a4fd71", quant: "IQ4_NL", params: "0.6B" });
    expect(parseHfRepoInfo({ nope: 1 })).toBeNull();
  });

  it("reads quant and parameter tags from file names", () => {
    expect(quantOf("Qwen3.5-2B-Q4_K_M.gguf")).toBe("Q4_K_M");
    expect(quantOf("gemma-3-1b-it-q4_0.gguf")).toBe("Q4_0");
    expect(quantOf("model-f16.gguf")).toBe("F16");
    expect(quantOf("model.gguf")).toBeNull();
    expect(paramsOf("Qwen3-Coder-30B-A3B-Instruct-IQ4_NL.gguf")).toBe("30B-A3B");
    expect(paramsOf("Qwen3.5-0.8B-Q4_K_M.gguf")).toBe("0.8B");
    expect(paramsOf("unsloth/Llama-GGUF")).toBeNull();
  });

  it("turns a picked file into a catalog model the vault can install and verify", () => {
    const r = parseHfRepoInfo(info)!;
    const m = hfFileAsModel(r, r.files[0]!);
    expect(m.id).toBe("hf:unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-IQ4_NL.gguf");
    expect(isHfModelId(m.id)).toBe(true);
    expect(m.name).toBe("Qwen3-0.6B");
    expect(m.file).toBe("unsloth--Qwen3-0.6B-GGUF--Qwen3-0.6B-IQ4_NL.gguf");
    expect(m.sha256).toBe(r.files[0]!.sha256);
    expect(m.delivery).toEqual([{ kind: "hf", repo: "unsloth/Qwen3-0.6B-GGUF", revision: "main", path: "Qwen3-0.6B-IQ4_NL.gguf" }]);
    expect(m.license).toBe("apache-2.0");
    expect(m.minRamGB).toBe(2);
    expect(httpsUrl(BUNDLED_MANIFEST, m)).toBe("https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-IQ4_NL.gguf");
  });

  it("RAM need grows with the file; names and vault file names are safe", () => {
    expect(ramNeedGB(500 * 1024 ** 2)).toEqual({ min: 2, recommended: 4 });
    expect(ramNeedGB(2.6 * 1024 ** 3)).toEqual({ min: 4, recommended: 6 });
    expect(hfDisplayName("sub/Llama-3.2-1B-Instruct-Q8_0.gguf")).toBe("Llama-3.2-1B-Instruct");
    expect(hfVaultFileName("a b/c", "x y.gguf")).toBe("a_b--c--x_y.gguf");
    expect(requestBytes("https://huggingface.co/api/models?search=q")).toBeGreaterThan(160);
  });
});
