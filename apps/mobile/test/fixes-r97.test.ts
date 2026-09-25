import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* F389 and F390 wiring in the chat; the behaviour itself is tested in packages/core/test/fixes-r97.test.ts. */
const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");

describe("F389 · the loop guard knows what the user asked", () => {
  it("passes the user's own message, never Continue's instruction", () => {
    expect(chat).toContain('find((m) => m.role === "user" && m.content !== CONTINUE_PROMPT)');
    expect(chat).toContain("stopLoop, { request: asked })");
  });
});

describe("F390 · Continue joins with a separator", () => {
  it("every place the row's text is built goes through the join", () => {
    expect(chat).toContain("joint = continuationSeparator(prefix, reply)");
    expect(chat).not.toContain("prefix + reply");
  });
});
