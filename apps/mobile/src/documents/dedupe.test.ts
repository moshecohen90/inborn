import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "@inborn/core";
import { findDuplicate } from "./dedupe";

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "a", name: "sample.pdf", kind: "pdf", bytes: 100, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, sha256: "abc", ...over });

describe("findDuplicate", () => {
  it("matches on hash and size", () => {
    const a = doc({});
    expect(findDuplicate([a], "abc", 100)).toBe(a);
    expect(findDuplicate([a], "abc", 101)).toBeNull();
    expect(findDuplicate([a], "abd", 100)).toBeNull();
  });
  it("a failed twin (no embedder yet) is still the same document; records without a hash never match", () => {
    const failed = doc({ status: "failed", error: "no-embedder" });
    expect(findDuplicate([failed], "abc", 100)).toBe(failed);
    expect(findDuplicate([doc({ sha256: undefined })], "abc", 100)).toBeNull();
  });
});
