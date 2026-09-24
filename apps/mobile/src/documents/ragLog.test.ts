import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const library = readFileSync(join(__dirname, "./library.ts"), "utf8");
const line = library.split("\n").find((l) => l.includes("`[rag]")) ?? "";

/**
 * F328. F282 was a Play release build citing a passage no question of the user's touched, and nothing on the phone
 * or in logcat printed the two numbers the floor reads. The next device run must be able to read them.
 */
describe("F328 · the retrieval line QA reads in logcat", () => {
  it("every question prints the cosine and the lexical count of every hit", () => {
    expect(line).toContain("cos=");
    expect(line).toContain("terms=");
    expect(line).toContain("bm25=");
    /* Which side of the floor each hit landed on, so the line explains the citation and not only the scores. */
    expect(line).toMatch(/isRelevant\(h, doors\)/);
  });

  it("the line carries the turn's mode and what survived the floor", () => {
    expect(line).toContain("strict=");
    expect(line).toContain("hits=");
    expect(line).toContain("used=");
  });

  it("it is not behind __DEV__: the build that showed the bug was a release build", () => {
    expect(line).not.toContain("__DEV__");
    expect(line.trim().startsWith("console.log(")).toBe(true);
  });
});
