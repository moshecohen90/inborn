import type { Delta, GenOpts, LocalLM, Message, ModelRef, Session, Tier } from "@inborn/core";
import { createEngine, type Engine } from "./adapters";
import { getVault } from "./vault/store";

export type EngineState = "unloaded" | "loading" | "loaded";
export type UnloadReason = "idle" | "critical" | "memory" | "switch" | "manual";

/** What the device guard (spec §6.5) is allowed to change between answers. */
export interface GenerationCaps {
  maxTokens: number;
  threads: number | null;
  gpuLayers: number | null;
  nCtx: number;
}

/** Weights leave memory after this long without an answer (spec §5.7); the next message loads them again. */
export const IDLE_UNLOAD_MS = 10 * 60_000;

let raw: Engine | null = null;
let guarded: Engine | null = null;
let session: Promise<Session> | null = null;
let live: Session | null = null;
let state: EngineState = "unloaded";
let unloadReason: UnloadReason | null = null;
let generating = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let caps: GenerationCaps = { maxTokens: 1024, threads: null, gpuLayers: null, nCtx: 4096 };
let lastGuardStop = false;
let unloading: Promise<void> | null = null;
let pauseCheck: (() => boolean) | null = null;
let pausedByGuard = false;
let resolveModel: ((tier: Tier) => ModelRef | null) | null = null;
const running = new Set<AbortController>();
const stateListeners = new Set<(s: EngineState) => void>();
const activityListeners = new Set<(busy: boolean) => void>();

const setState = (s: EngineState) => {
  if (s === state) return;
  state = s;
  for (const l of stateListeners) l(s);
};

const armIdle = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!generating && live) void unloadSession("idle");
  }, IDLE_UNLOAD_MS);
};

function getRaw(): Engine {
  return (raw ??= createEngine());
}

export function getEngine(): Engine {
  return (guarded ??= guard());
}

/** The engine if a screen already created it; the guard must not create it before prepareEngine() settled (web probes its host). */
export const peekEngine = (): Engine | null => raw;

/** One load per app run: screens mount and unmount, the weights stay resident until idle unload or the guard drops them. */
export function loadSession(nCtx = caps.nCtx): Promise<Session> {
  if (!session) {
    const { engine, model } = getRaw();
    const vault = getVault();
    setState("loading");
    /* A crash inside load() leaves the "loading" mark on disk, which quarantines the file at next boot (§10.1 #8). */
    vault.markLoading(model.id, true);
    /* Never start a load while the previous weights are still being released. */
    session = (unloading ?? Promise.resolve())
      .then(() => engine.load(model, { nCtx, threads: caps.threads ?? undefined, gpuLayers: caps.gpuLayers ?? undefined }))
      .then((s) => {
        vault.markLoading(model.id, false);
        live = s;
        unloadReason = null;
        setState("loaded");
        armIdle();
        return s;
      })
      .catch((e: unknown) => {
        session = null;
        setState("unloaded");
        throw e;
      });
  }
  return session;
}

const waitIdle = async (): Promise<void> => {
  for (let i = 0; generating && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
};

/** Drops the weights; a running answer is stopped first. The next generate() (or noteForeground after idle) loads again. */
export function unloadSession(reason: UnloadReason = "manual"): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!session) return unloading ?? Promise.resolve();
  const pending = session;
  session = null;
  live = null;
  unloadReason = reason;
  setState("unloaded");
  if (generating) stopGeneration();
  const done = (async () => {
    await waitIdle();
    try {
      await pending;
    } catch {
      return;
    }
    await getRaw().engine.unload();
    if (__DEV__) console.log(`[inborn] engine unloaded (${reason})`);
  })().finally(() => {
    if (unloading === done) unloading = null;
  });
  unloading = done;
  return done;
}

/** Aborts every running answer; the guard uses it for critical heat, memory pressure and the background grace. */
export function stopGeneration(): void {
  lastGuardStop = running.size > 0;
  for (const ac of running) ac.abort();
}

/** True when the last answer was cut by the guard rather than the user (Chat.tsx only sees its own signal). */
export const wasStoppedByGuard = (): boolean => lastGuardStop;

/** Asked on every streamed token: Android pauses JS timers in the background, so the 15 s grace (§6.5) is enforced here. */
export function setPauseCheck(fn: (() => boolean) | null): void {
  pauseCheck = fn;
}

/** Whether an answer was paused by the check since the last call; reading clears it. */
export function consumePausedByGuard(): boolean {
  const was = pausedByGuard;
  pausedByGuard = false;
  return was;
}

export function setGenerationCaps(next: Partial<GenerationCaps>): void {
  caps = { ...caps, ...next };
}

export const getGenerationCaps = (): GenerationCaps => caps;
export const getEngineState = (): EngineState => state;
export const getUnloadReason = (): UnloadReason | null => unloadReason;
export const isGenerating = (): boolean => generating > 0;

export function subscribeEngineState(l: (s: EngineState) => void): () => void {
  stateListeners.add(l);
  return () => void stateListeners.delete(l);
}

export function subscribeActivity(l: (busy: boolean) => void): () => void {
  activityListeners.add(l);
  return () => void activityListeners.delete(l);
}

/** Idle-unloaded weights come back as soon as the app is in front again, so the first message does not pay the load. */
export function noteForeground(): void {
  if (state === "unloaded" && unloadReason === "idle") void loadSession().catch((e: unknown) => console.warn("[inborn] reload after idle failed", e));
  else if (live) armIdle();
}

export function noteBackground(): void {
  if (live) armIdle();
}

/** The catalog (M2) plugs in here; until then there is one model and switching reports false. */
export function registerModelResolver(r: (tier: Tier) => ModelRef | null): void {
  resolveModel = r;
}

/** Switches between answers, never mid-answer (spec §6.5). Resolves false when no model of that tier is available; `load` false leaves the new model for the next message. */
export async function switchModel(tier: Tier, load = true): Promise<boolean> {
  const engine = getRaw();
  const ref = resolveModel?.(tier) ?? null;
  if (!ref) return false;
  if (ref.id === engine.model.id) return true;
  await waitIdle();
  await unloadSession("switch");
  engine.model = ref;
  if (load) await loadSession();
  return true;
}

/* Every answer goes through here: caps applied, the guard can abort it, a stale session after an unload is replaced by the live one. */
function guard(): Engine {
  const lm = () => getRaw().engine;
  const engine: LocalLM = {
    get id() {
      return lm().id;
    },
    capabilities: () => lm().capabilities(),
    load: (m, o) => lm().load(m, o),
    unload: () => unloadSession("manual"),
    embed: (t) => lm().embed(t),
    stats: () => lm().stats(),
    async *generate(_stale: Session, messages: Message[], opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta> {
      const s = await loadSession();
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      if (signal.aborted) ac.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
      running.add(ac);
      lastGuardStop = false;
      if (idleTimer) clearTimeout(idleTimer);
      if (++generating === 1) for (const l of activityListeners) l(true);
      try {
        const merged: GenOpts = { ...opts, maxTokens: Math.min(opts.maxTokens ?? caps.maxTokens, caps.maxTokens), threads: opts.threads ?? caps.threads ?? undefined };
        for await (const d of lm().generate(s, messages, merged, ac.signal)) {
          if (!ac.signal.aborted && pauseCheck?.()) {
            pausedByGuard = true;
            lastGuardStop = true;
            ac.abort();
            if (__DEV__) console.log("[inborn] answer paused: background grace expired");
          }
          yield d;
        }
      } finally {
        running.delete(ac);
        signal.removeEventListener("abort", onAbort);
        if (--generating === 0) {
          for (const l of activityListeners) l(false);
          if (live) armIdle();
        }
      }
    },
  };
  Object.defineProperty(engine, "devInfo", { get: () => (lm() as { devInfo?: unknown }).devInfo, enumerable: true });
  return {
    engine,
    get model() {
      return getRaw().model;
    },
  };
}

/** Attaches the vision projector (spec §6.2) to the resident model; false when the engine or model cannot see. */
export async function enableVision(mmprojPath: string): Promise<boolean> {
  await loadSession();
  const lm = getRaw().engine as LocalLM & { enableVision?: (path: string) => Promise<boolean> };
  return lm.enableVision ? lm.enableVision(mmprojPath) : false;
}

/** After the vault switches the default model: drop the weights and the engine so the next loadSession() picks the new file. */
export async function resetEngine(): Promise<void> {
  await unloadSession("switch").catch((e: unknown) => console.warn("[inborn] unload", e));
  raw = null;
}
