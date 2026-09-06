import { describe, expect, it } from "vitest";
import { NullLM } from "../src/index";

const model = { id: "instant", uri: "bundled://instant" };

describe("NullLM", () => {
  it("streams the reply word by word and reports usage", async () => {
    const lm = new NullLM("one two three");
    const s = await lm.load(model, { nCtx: 2048 });
    const out: string[] = [];
    let done = false;
    for await (const d of lm.generate(s, [{ role: "user", content: "hi" }], {}, new AbortController().signal)) {
      if (d.text) out.push(d.text);
      if (d.done) done = true;
    }
    expect(out.join("")).toBe("one two three");
    expect(done).toBe(true);
    expect(lm.stats().ctxUsed).toBe(4);
  });

  it("stops when aborted", async () => {
    const lm = new NullLM("a b c d e f", 5);
    const s = await lm.load(model, { nCtx: 2048 });
    const ac = new AbortController();
    let n = 0;
    for await (const d of lm.generate(s, [], {}, ac.signal)) {
      if (d.text) n++;
      if (n === 2) ac.abort();
    }
    expect(n).toBe(2);
  });

  it("refuses an unloaded session", async () => {
    const lm = new NullLM();
    const s = await lm.load(model, { nCtx: 1024 });
    await lm.unload();
    await expect(async () => {
      for await (const _ of lm.generate(s, [], {}, new AbortController().signal)) void _;
    }).rejects.toThrow();
  });
});
