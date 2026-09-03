import { describe, expect, it } from "vitest";
import { NullLM, pickDefault, type CatalogModel } from "../src/index";

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

describe("pickDefault", () => {
  const base: Omit<CatalogModel, "id" | "tier" | "minRamGB" | "proOnly"> = {
    name: "", goodFor: "", battery: "low", file: "", bytes: 0, sha256: "", license: "Apache-2.0", vision: false, goodLanguages: [], delivery: [{ kind: "bundled" }],
  };
  const models: CatalogModel[] = [
    { ...base, id: "instant", tier: "instant", minRamGB: 4, proOnly: false },
    { ...base, id: "fast", tier: "fast", minRamGB: 6, proOnly: false },
    { ...base, id: "sharp", tier: "sharp", minRamGB: 8, proOnly: true },
  ];
  it("prefers Fast on 6–8 GB phones and Instant on 4 GB", () => {
    expect(pickDefault(models, 8)?.id).toBe("fast");
    expect(pickDefault(models, 4)?.id).toBe("instant");
  });
});
