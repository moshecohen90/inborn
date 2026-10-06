import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Delta, GenOpts, LoadOptions, Message, ModelRef, Session } from "@inborn/core";

/* Round 134J: build 40, iPhone 13 Pro. A memory warning came while Fast's 668 MB photo pack was loading for a new photo.
   The guard released the weights and switched to Instant, but the photo turn loaded Fast again without its pack and
   described the story in the chat instead of the photo; Instant's own pack was then attached to the Fast weights. */

const FAST: ModelRef = { id: "fast", uri: "file://fast.gguf" };
const INSTANT: ModelRef = { id: "instant", uri: "file://instant.gguf" };

const lm = vi.hoisted(() => {
  const state = {
    loads: [] as string[],
    loaded: null as string | null,
    vision: false,
    attached: [] as string[],
    /** What the adapter was asked to send, per call: how many pictures reached it. */
    sentPictures: [] as number[],
    releaseGate: null as Promise<void> | null,
    attachGate: null as Promise<void> | null,
    attachWorks: true,
  };
  return state;
});

class FakeLM {
  readonly id = "llama.rn" as const;
  private session: Session | null = null;
  capabilities() {
    return { vision: lm.vision, tools: false, embeddings: false, maxContext: 4096, continuation: false };
  }
  async load(model: ModelRef, o: LoadOptions): Promise<Session> {
    lm.loads.push(model.id);
    lm.loaded = model.id;
    lm.vision = false;
    this.session = { model, nCtx: o.nCtx ?? 4096 };
    return this.session;
  }
  async unload(): Promise<void> {
    if (lm.releaseGate) await lm.releaseGate;
    lm.loaded = null;
    lm.vision = false;
  }
  async enableVision(path: string): Promise<boolean> {
    if (lm.attachGate) await lm.attachGate;
    lm.attached.push(path);
    lm.vision = lm.attachWorks;
    return lm.vision;
  }
  async releaseVision(): Promise<boolean> {
    const was = lm.vision;
    lm.vision = false;
    return was;
  }
  embed(): Promise<number[][]> {
    return Promise.resolve([]);
  }
  stats() {
    return { tokPerSec: 10, ttftMs: 1, ctxUsed: 1, memMB: 0 };
  }
  async *generate(_s: Session, messages: Message[], _o: GenOpts, _signal: AbortSignal): AsyncIterable<Delta> {
    /* Like llama.rn: without a projector the picture is not sent, and the model answers from the words around it. */
    lm.sentPictures.push(lm.vision ? messages.reduce((n, m) => n + (m.images?.length ?? 0), 0) : 0);
    yield { text: `answer from ${lm.loaded}` };
  }
}

const fake = vi.hoisted(() => ({ engine: null as unknown, model: null as unknown }));
vi.mock("./adapters", () => ({ createEngine: () => fake }));
vi.mock("./vault/store", () => ({ getVault: () => ({ markLoading() {} }) }));

type EngineModule = typeof import("./engine");

const fresh = async (): Promise<EngineModule> => {
  vi.resetModules();
  Object.assign(lm, { loads: [], loaded: null, vision: false, attached: [], sentPictures: [], releaseGate: null, attachGate: null, attachWorks: true });
  fake.engine = new FakeLM();
  fake.model = { ...FAST };
  const e = await import("./engine");
  e.registerModelResolver((tier) => (tier === "instant" ? INSTANT : tier === "fast" ? FAST : null));
  e.registerVisionResolver((id) => `pack-for-${id}`);
  return e;
};

const gate = () => {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
};

const drain = async (it: AsyncIterable<Delta>): Promise<string> => {
  let out = "";
  for await (const d of it) out += d.text ?? "";
  return out;
};

const photoTurn: Message[] = [
  { role: "user", content: "Write a story", images: [] },
  { role: "assistant", content: "Once…" },
  { role: "user", content: "What do you see?", images: ["file://cafe.jpg"] },
];

describe("a memory switch during a photo turn (round 134J)", () => {
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it("a turn that loads while the guard releases the old weights gets the new model", async () => {
    const e = await fresh();
    await e.loadSession();
    const release = gate();
    lm.releaseGate = release.promise;
    /* The guard: unload for memory, then the switch that names Instant and leaves it for the next message. */
    /* The vault's "In use" re-reads the engine's model on every state change. */
    const seen: (string | null)[] = [];
    e.subscribeEngineState(() => seen.push(e.engineModelId()));
    void e.unloadSession("memory");
    const switched = e.switchModel("instant", false);
    /* The photo turn asks for its session while the release is still running. */
    const turn = e.loadSession();
    release.open();
    const s = await turn;
    await switched;
    expect(s.model.id).toBe("instant");
    expect(lm.loads).toEqual(["fast", "instant"]);
    expect(e.getEngine().model.id).toBe("instant");
    expect(e.getLoadedModelId()).toBe("instant");
    expect(seen.at(-1)).toBe("instant");
    expect(seen).toContain("instant");
    expect(await e.settledModelId()).toBe("instant");
  });

  it("the vault hears about the switched model even when nothing loads it yet", async () => {
    const e = await fresh();
    await e.loadSession();
    const seen: (string | null)[] = [];
    e.subscribeEngineState(() => seen.push(e.engineModelId()));
    await e.switchModel("instant", false);
    expect(seen.at(-1)).toBe("instant");
  });

  it("a new picture reaching a model without its projector gets that model's own pack, never a blind answer", async () => {
    const e = await fresh();
    await e.switchModel("instant");
    const s = await e.loadSession();
    const reply = await drain(e.getEngine().engine.generate(s, photoTurn, {}, new AbortController().signal));
    expect(lm.attached).toEqual(["pack-for-instant"]);
    expect(lm.sentPictures).toEqual([1]);
    expect(reply).toBe("answer from instant");
  });

  it("a picture that cannot be attached stops the turn instead of answering around it", async () => {
    const e = await fresh();
    lm.attachWorks = false;
    const s = await e.loadSession();
    await expect(drain(e.getEngine().engine.generate(s, photoTurn, {}, new AbortController().signal))).rejects.toThrow("vision-unavailable");
    expect(lm.sentPictures).toEqual([]);
  });

  it("after the guard released the projector, an older picture stays out and nothing loads it again", async () => {
    const e = await fresh();
    const s = await e.loadSession();
    expect(await e.enableVision("pack-for-fast")).toBe(true);
    expect(await e.releaseVision()).toBe(true);
    expect(e.isVisionEased()).toBe(true);
    const textTurn: Message[] = [...photoTurn, { role: "assistant", content: "A café menu." }, { role: "user", content: "Give it a title." }];
    await drain(e.getEngine().engine.generate(s, textTurn, {}, new AbortController().signal));
    expect(lm.attached).toEqual(["pack-for-fast"]);
    expect(lm.sentPictures).toEqual([0]);
    /* A new photo while eased: the projector comes back for it. */
    await drain(e.getEngine().engine.generate(s, photoTurn, {}, new AbortController().signal));
    expect(lm.attached).toEqual(["pack-for-fast", "pack-for-fast"]);
    expect(lm.sentPictures).toEqual([0, 1]);
    expect(e.isVisionEased()).toBe(false);
  });

  it("a projector that finishes loading after the guard unloaded its weights is not reported attached", async () => {
    const e = await fresh();
    await e.loadSession();
    const attach = gate();
    lm.attachGate = attach.promise;
    const on = e.enableVision("pack-for-fast");
    for (let i = 0; i < 10; i++) await Promise.resolve();
    void e.unloadSession("memory");
    attach.open();
    expect(await on).toBe(false);
  });
});
