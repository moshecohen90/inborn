import { describe, expect, it } from "vitest";
import { SHARE_TEXT_MAX_CHARS } from "@inborn/core";
import { readSeedParam } from "./useShareTarget";

/* The site's hero composer is a zero-JS GET form: whatever the reader typed arrives here as `?q=`. */
describe("readSeedParam", () => {
  it("reads the site composer's first message", () => {
    expect(readSeedParam("?q=What%20is%20a%20GGUF%20file%3F")).toBe("What is a GGUF file?");
  });

  it("survives the other parameters a link may carry", () => {
    expect(readSeedParam("?utm_source=site&q=hello&ref=hero")).toBe("hello");
  });

  it("keeps a plus sign typed by the reader, which form encoding sends as %2B", () => {
    expect(readSeedParam("?q=1%2B1")).toBe("1+1");
  });

  it("caps at the shared-text limit instead of holding an unbounded string", () => {
    const long = "a".repeat(SHARE_TEXT_MAX_CHARS + 500);
    expect(readSeedParam(`?q=${long}`)).toHaveLength(SHARE_TEXT_MAX_CHARS);
  });

  it("gives null when there is nothing to seed", () => {
    expect(readSeedParam("")).toBeNull();
    expect(readSeedParam("?q=")).toBeNull();
    expect(readSeedParam("?q=%20%20")).toBeNull();
    expect(readSeedParam("?other=1")).toBeNull();
  });

  /* A hand-edited or truncated address must not white-screen the app before the chat is even on screen. */
  it("never throws on a malformed query", () => {
    expect(() => readSeedParam("?q=%E0%A4%A")).not.toThrow();
    expect(() => readSeedParam("?%=&&q")).not.toThrow();
  });
});
