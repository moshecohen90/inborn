import { afterEach, describe, expect, it, vi } from "vitest";
import { RELOAD_GUARD_MS, onNewController, registerServiceWorker } from "./serviceWorker";
import { holdUpdate } from "./updateHold";

/**
 * F404. After a deploy the first reload was answered from the old precache while the new worker installed and
 * claimed the page; only a second reload showed the new build ("still shows the same", Moshe 26.9).
 */
describe("F404 · the page hands over to a new service worker", () => {
  const base = { wasControlled: true, busy: false, lastReloadAt: null, now: 1_000_000 };

  it("a page that was already controlled reloads once when a new worker takes over", () => {
    expect(onNewController(base)).toBe("reload");
  });

  it("the first install of a never-controlled page is not a deploy", () => {
    expect(onNewController({ ...base, wasControlled: false })).toBe("ignore");
    expect(onNewController({ ...base, wasControlled: false, busy: true })).toBe("ignore");
  });

  it("a download or a streaming answer is never cut: the page offers the reload", () => {
    expect(onNewController({ ...base, busy: true })).toBe("offer");
  });

  it("a second hand-over right after a reload offers instead of looping", () => {
    expect(onNewController({ ...base, lastReloadAt: base.now - 1_000 })).toBe("offer");
    expect(onNewController({ ...base, lastReloadAt: base.now - RELOAD_GUARD_MS })).toBe("reload");
    /* A clock that moved backwards is no evidence of a loop. */
    expect(onNewController({ ...base, lastReloadAt: base.now + 5_000 })).toBe("reload");
  });
});

type Listener = () => void;

function fakeBrowser(controlled: boolean) {
  const swListeners: Record<string, Listener[]> = {};
  const docListeners: Record<string, Listener[]> = {};
  const store = new Map<string, string>();
  const reload = vi.fn();
  const update = vi.fn(() => Promise.resolve());
  const reg = { active: {}, installing: null, waiting: null, update };
  const sw = {
    controller: controlled ? {} : null,
    ready: Promise.resolve(reg),
    register: vi.fn(() => Promise.resolve(reg)),
    addEventListener: (t: string, f: Listener) => void (swListeners[t] ??= []).push(f),
  };
  const doc = { visibilityState: "visible", addEventListener: (t: string, f: Listener) => void (docListeners[t] ??= []).push(f) };
  vi.stubGlobal("navigator", { serviceWorker: sw });
  vi.stubGlobal("location", { protocol: "https:", reload });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  const fire = (t: string) => swListeners[t]?.forEach((f) => f());
  return { reload, update, fire, docFire: (t: string) => docListeners[t]?.forEach((f) => f()), store };
}

describe("F404 · registerServiceWorker listens for the hand-over", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reloads once on controllerchange, and the next change right after offers instead", async () => {
    const b = fakeBrowser(true);
    const offer = vi.fn();
    await registerServiceWorker(() => undefined, offer);
    b.fire("controllerchange");
    expect(b.reload).toHaveBeenCalledTimes(1);
    b.fire("controllerchange");
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(offer).toHaveBeenCalledTimes(1);
  });

  it("the first visit's clientsClaim does not reload, a later deploy in the same tab does", async () => {
    const b = fakeBrowser(false);
    await registerServiceWorker(() => undefined);
    b.fire("controllerchange");
    expect(b.reload).not.toHaveBeenCalled();
    b.store.clear();
    b.fire("controllerchange");
    expect(b.reload).toHaveBeenCalledTimes(1);
  });

  it("while work holds the update, it offers the line and does not reload", async () => {
    const b = fakeBrowser(true);
    const offer = vi.fn();
    await registerServiceWorker(() => undefined, offer);
    const release = holdUpdate();
    b.fire("controllerchange");
    release();
    expect(b.reload).not.toHaveBeenCalled();
    expect(offer).toHaveBeenCalledTimes(1);
  });

  it("a tab coming back to the front asks for a new worker", async () => {
    const b = fakeBrowser(true);
    await registerServiceWorker(() => undefined);
    b.docFire("visibilitychange");
    expect(b.update).toHaveBeenCalledTimes(1);
  });
});
