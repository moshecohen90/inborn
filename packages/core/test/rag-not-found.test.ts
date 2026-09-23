import { describe, expect, it } from "vitest";
import { NOT_FOUND_TOKEN, isNotFoundReply } from "../src/rag";

describe("isNotFoundReply (QA F141)", () => {
  it("accepts the token exactly as the prompt asks for it", () => {
    expect(isNotFoundReply(NOT_FOUND_TOKEN)).toBe(true);
    expect(isNotFoundReply(`  ${NOT_FOUND_TOKEN}\n`)).toBe(true);
  });

  it("accepts what a small model actually returns", () => {
    /* This exact casing reached the screen on the iPhone 13 Pro instead of the localized sentence. */
    expect(isNotFoundReply("Not_FOUND_IN_DOCUMENTS")).toBe(true);
    expect(isNotFoundReply("not_found_in_documents")).toBe(true);
    expect(isNotFoundReply("**NOT_FOUND_IN_DOCUMENTS**")).toBe(true);
    expect(isNotFoundReply('"NOT_FOUND_IN_DOCUMENTS"')).toBe(true);
    expect(isNotFoundReply("NOT FOUND IN DOCUMENTS")).toBe(true);
    expect(isNotFoundReply("NOT_FOUND_IN_DOCUMENTS.")).toBe(true);
  });

  it("leaves a real answer alone, including one that talks about the token", () => {
    expect(isNotFoundReply("The service code is QUARTZ-4417.")).toBe(false);
    expect(isNotFoundReply("")).toBe(false);
    expect(isNotFoundReply("The passages do not cover bicycles, so I would answer NOT_FOUND_IN_DOCUMENTS here.")).toBe(false);
    expect(isNotFoundReply("NOT_FOUND_IN_DOCUMENTSXYZ is a different string")).toBe(false);
  });
});
