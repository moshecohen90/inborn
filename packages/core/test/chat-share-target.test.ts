import { describe, expect, it } from "vitest";
import { SHARE_TEXT_MAX_CHARS, isShareHandoffPath, parseSharePayload } from "../src/chat/shareTarget";

describe("parseSharePayload (spec §7.7)", () => {
  it("Android ACTION_SEND text", () => {
    expect(parseSharePayload({ kind: "text", text: "hello from Chrome" })).toEqual({ kind: "text", text: "hello from Chrome" });
  });

  it("Android ACTION_PROCESS_TEXT keeps the read-only flag as replaceable", () => {
    expect(parseSharePayload({ kind: "processText", text: "fix me", readonly: false })).toEqual({ kind: "processText", text: "fix me", replaceable: true });
    expect(parseSharePayload({ kind: "processText", text: "fix me", readonly: "true" })).toEqual({ kind: "processText", text: "fix me", replaceable: false });
    expect(parseSharePayload({ kind: "processText", text: "" })).toBeNull();
  });

  it("Android files with the module's field names", () => {
    const p = parseSharePayload({ kind: "files", files: [{ uri: "file:///cache/shared/a.pdf", name: "a.pdf", mimeType: "application/pdf", bytes: 1234 }] });
    expect(p).toEqual({ kind: "files", files: [{ uri: "file:///cache/shared/a.pdf", name: "a.pdf", mimeType: "application/pdf", bytes: 1234 }] });
  });

  it("iOS expo-share-intent shapes: text, weburl and file", () => {
    expect(parseSharePayload({ type: "text", text: "quoted", webUrl: null, files: null })).toEqual({ kind: "text", text: "quoted" });
    expect(parseSharePayload({ type: "weburl", text: "https://x.y", webUrl: "https://x.y", files: null })).toEqual({ kind: "text", text: "https://x.y" });
    const file = parseSharePayload({ type: "file", text: null, files: [{ path: "file:///g/doc.docx", fileName: "doc.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: "99" }] });
    expect(file).toEqual({ kind: "files", files: [{ uri: "file:///g/doc.docx", name: "doc.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 99 }] });
  });

  it("nothing usable → null; oversized text is capped", () => {
    expect(parseSharePayload(null)).toBeNull();
    expect(parseSharePayload({ type: "text", text: "" })).toBeNull();
    expect(parseSharePayload({ kind: "files", files: [{}] })).toBeNull();
    const big = parseSharePayload({ kind: "text", text: "x".repeat(SHARE_TEXT_MAX_CHARS + 10) });
    expect(big?.kind === "text" && big.text.length).toBe(SHARE_TEXT_MAX_CHARS);
  });

  it("recognises the share-extension handoff URL", () => {
    expect(isShareHandoffPath("inborn://dataUrl=inbornShareKey?nonce=1#text")).toBe(true);
    expect(isShareHandoffPath("/dataUrl=inbornShareKey")).toBe(true);
    expect(isShareHandoffPath("/paywall")).toBe(false);
  });
});
