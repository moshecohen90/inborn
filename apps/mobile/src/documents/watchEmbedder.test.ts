import { describe, expect, it, vi } from "vitest";

/* The watch only reads the vault's state; the native pieces behind the module never load in this test. */
type State = { kind: "ready"; path: string } | { kind: "not-installed" } | { kind: "delivering" };
let state: State = { kind: "not-installed" };
const listeners = new Set<() => void>();
vi.mock("expo-file-system", () => ({ File: class {}, Paths: { document: "/doc" } }));
vi.mock("../adapters/llamaRn", () => ({ LlamaRnEmbedder: class {} }));
vi.mock("../vault/store", () => ({
  getVault: () => ({
    state: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  }),
}));

const { watchEmbedder } = await import("./embedder.native");
const notify = (next: State) => {
  state = next;
  for (const l of listeners) l();
};

describe("watchEmbedder (QA O3 + O9)", () => {
  it("fires once when the model lands, once when it leaves, never on progress ticks", () => {
    const seen: string[] = [];
    const stop = watchEmbedder(() => seen.push(state.kind));
    notify({ kind: "delivering" });
    notify({ kind: "delivering" });
    notify({ kind: "ready", path: "/models/a.gguf" });
    notify({ kind: "ready", path: "/models/a.gguf" });
    notify({ kind: "not-installed" });
    notify({ kind: "not-installed" });
    stop();
    notify({ kind: "ready", path: "/models/a.gguf" });
    expect(seen).toEqual(["ready", "not-installed"]);
  });
});
