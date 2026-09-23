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

  /* F196: every shape below reached the screen as the raw sentinel. The lead-in cap is what keeps the last block false. */
  it.each([
    ["Answer: NOT_FOUND_IN_DOCUMENTS", true],
    ["Answer:\nNOT_FOUND_IN_DOCUMENTS", true],
    ["[NOT_FOUND_IN_DOCUMENTS]", true],
    ["<NOT_FOUND_IN_DOCUMENTS>", true],
    ["(not found in documents)", true],
    ["{NOT_FOUND_IN_DOCUMENTS}", true],
    ["I am sorry, NOT_FOUND_IN_DOCUMENTS", true],
    ["Sorry — NOT_FOUND_IN_DOCUMENTS", true],
    ["### NOT_FOUND_IN_DOCUMENTS", true],
    ["- NOT_FOUND_IN_DOCUMENTS", true],
    ["Result: **Not_Found_In_Documents**.", true],
    ["nOt_fOuNd_iN_dOcUmEnTs", true],
    ["The attached passages were read carefully and NOT_FOUND_IN_DOCUMENTS applies here.", false],
    ["Your document lists four suppliers and none of them was found in documents we hold.", false],
    ["NOT_FOUND_IN_DOCUMENTSX", false],
    ["FOUND_IN_DOCUMENTS", false],
  ])("%j → %s", (reply, expected) => {
    expect(isNotFoundReply(reply)).toBe(expected);
  });

  it("leaves a real answer alone, including one that talks about the token", () => {
    expect(isNotFoundReply("The service code is QUARTZ-4417.")).toBe(false);
    expect(isNotFoundReply("")).toBe(false);
    expect(isNotFoundReply("The passages do not cover bicycles, so I would answer NOT_FOUND_IN_DOCUMENTS here.")).toBe(false);
    expect(isNotFoundReply("NOT_FOUND_IN_DOCUMENTSXYZ is a different string")).toBe(false);
  });
});
