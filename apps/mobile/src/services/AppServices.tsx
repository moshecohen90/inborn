import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { getLocales } from "expo-localization";
import { i18next, initI18n } from "@inborn/i18n";
import { deviceNoun } from "../lib/deviceNoun";
import { accumulate, ChatStore, InMemoryChatRepository, NetworkLog, type Chat, type ChatRepository, type SharePayload } from "@inborn/core";
import { prepareEngine, type Engine } from "../adapters";
import { getEngine, hasSessionOverride, isGenerating, resetEngine, subscribeActivity, subscribeEngineState } from "../engine";
import { getVault } from "../vault/store";
import { applyBootFloor, startDeviceGuard } from "../device/boot";
import { getDeviceGuard } from "../device/guard";
import { openPersistentStorage } from "../storage/persistent";
import type { PersistenceKind } from "../storage/types";
import { wipe, type WipeOptions } from "../storage/wipe";
import { getLicence, wipeLicence } from "../licence";
import { useAppLock, type AppLock } from "../lock/useAppLock";
import { isCaptured, onCapturedChange, setSecure } from "../../modules/secure-screen";
import { meterKind, sample, type MeterKind } from "../proof/meterSource";
import { priorTransfers } from "../proof/webDelivery";
import { drainTransfers, subscribeTransfers } from "../proof/transfers";
import type { SealState } from "../components/Seal";
import { defaultPrefs, mergePrefs, type Prefs } from "./prefsTypes";
import { deletePrefs, readPrefsRaw, writePrefsRaw } from "./prefsStore";
import { applyTextScale, applyThemeMode } from "./theme";
import { RETENTION_TICK_MS, runRetention } from "./retention";

/** `key` remounts the chat screen whenever a different conversation is opened. */
export interface ActiveChat {
  id: string | null;
  incognito: boolean;
  key: number;
  /** Persona chosen in the new-chat sheet for a chat that does not exist yet. */
  personaId?: string;
  /** Text or files another app shared in (§7.7); the chat screen consumes it once it is ready and clears it. */
  seed?: SharePayload;
}

/** Filled by the vault stream while the store/system delivers a model (§8.8 "model delivering"). */
export interface DeliveryState {
  name: string;
  status: "idle" | "delivering" | "verifying" | "done" | "failed";
  progress: number;
  totalBytes: number;
}

export interface Meter {
  out: number;
  in: number;
  connections: number;
  kind: MeterKind;
  since: number;
}

export interface AppServices {
  store: ChatStore;
  storageKind: PersistenceKind;
  engine: Engine;
  prefs: Prefs;
  updatePrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)): void;
  lock: AppLock;
  /** Screen is being mirrored or recorded (iOS). */
  captured: boolean;
  sealState: SealState;
  setSealState(s: SealState): void;
  networkLog: NetworkLog;
  meter: Meter;
  active: ActiveChat;
  openChat(chat: Chat): void;
  newChat(incognito: boolean, personaId?: string): void;
  chatCreated(id: string): void;
  chatDeleted(id: string): void;
  /** Bumped when chats vanish outside the drawer (auto-delete): a mounted drawer refreshes its list. */
  chatsVersion: number;
  /** A share-sheet / "Ask Inborn" item: a fresh chat carrying it (§7.7, S43). */
  openShared(payload: SharePayload): void;
  seedConsumed(): void;
  /** The vault changed the default model (or one just arrived): pick the engine up again; callers remount the chat. */
  modelChanged(): void;
  delivery: DeliveryState | null;
  setDelivery(d: DeliveryState | null): void;
  /** §8.8: hand the chat to Instant while the device is hot / low; `switchBack` returns to the model in use before. */
  switchToInstant(): void;
  switchBack(): void;
  continueGeneration(): void;
  /** Emergency wipe, then a fresh boot (new key, new database, onboarding again). */
  wipeAll(opts: WipeOptions): Promise<void>;
}

const Ctx = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const s = useContext(Ctx);
  if (!s) throw new Error("useAppServices outside <AppServicesProvider>");
  return s;
}

interface Booted {
  store: ChatStore;
  storageKind: PersistenceKind;
  engine: Engine;
}

async function boot(prefs: Prefs): Promise<Booted> {
  const tags = getLocales().map((l) => l.languageTag);
  await Promise.all([initI18n(prefs.locale ?? tags[0] ?? "en", tags, { device: deviceNoun() }), prepareEngine()]);
  startDeviceGuard();
  await applyBootFloor();
  let repository: ChatRepository;
  let storageKind: PersistenceKind;
  try {
    const opened = await openPersistentStorage();
    repository = opened.repository;
    storageKind = opened.kind;
  } catch (e: unknown) {
    console.warn("Encrypted storage unavailable; chats stay in memory for this run.", e);
    repository = new InMemoryChatRepository();
    storageKind = "memory";
  }
  return { store: new ChatStore(repository), storageKind, engine: getEngine() };
}

const METER_POLL_MS = 2000;
const METER_WRITE_MS = 5000;

export function AppServicesProvider({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => mergePrefs(readPrefsRaw(), Date.now()));
  const [booted, setBooted] = useState<Booted | null>(null);
  const [generation, setGeneration] = useState(0);
  const [active, setActive] = useState<ActiveChat>({ id: null, incognito: false, key: 0 });
  const [sealState, setSealState] = useState<SealState>("sealed");
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [captured, setCaptured] = useState(false);
  const [logTick, setLogTick] = useState(0);
  const [chatsVersion, setChatsVersion] = useState(0);
  const networkLog = useMemo(() => {
    const log = new NetworkLog();
    for (const r of priorTransfers()) log.record(r);
    return log;
  }, []);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const activeRef = useRef(active);
  activeRef.current = active;
  const lastMeterWrite = useRef(0);
  const bootedRef = useRef(booted);
  bootedRef.current = booted;
  const swapping = useRef(false);
  const reloadQueued = useRef(false);

  /* A different default model (vault, §8.8 switch, a pack that just landed): unload, resolve again, remount the chat. */
  const reloadEngine = useCallback(async () => {
    if (swapping.current) return;
    swapping.current = true;
    try {
      await resetEngine();
      setBooted((b) => (b ? { ...b, engine: getEngine() } : b));
      setActive((a) => ({ ...a, key: a.key + 1 }));
    } finally {
      swapping.current = false;
    }
  }, []);

  /* A model swap never interrupts an answer (§6.5): while one streams, the reload waits for the engine to go idle. */
  const reloadWhenIdle = useCallback(() => {
    if (reloadQueued.current) return;
    if (!isGenerating()) return void reloadEngine();
    reloadQueued.current = true;
    const off = subscribeActivity((busy) => {
      if (busy) return;
      off();
      reloadQueued.current = false;
      void reloadEngine();
    });
  }, [reloadEngine]);

  const updatePrefs = useCallback((patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => {
    setPrefs((p) => {
      const next = { ...p, ...(typeof patch === "function" ? patch(p) : patch) };
      writePrefsRaw(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyThemeMode(prefs.themeMode);
  }, [prefs.themeMode]);

  useEffect(() => {
    applyTextScale(prefs.textScale);
  }, [prefs.textScale]);

  useEffect(() => {
    if (prefs.locale && i18next.isInitialized && i18next.language !== prefs.locale) void i18next.changeLanguage(prefs.locale);
  }, [prefs.locale]);

  // Android: one flag covers both rows; FLAG_SECURE is what blanks the recents thumbnail as well as screenshots.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void setSecure(prefs.lock.screenshotProtection || (prefs.lock.enabled && prefs.lock.hideInSwitcher));
  }, [prefs.lock.screenshotProtection, prefs.lock.enabled, prefs.lock.hideInSwitcher]);

  useEffect(() => {
    setCaptured(isCaptured());
    return onCapturedChange(setCaptured);
  }, []);

  // S52 › Performance feeds the guard (§6.5): "Never switch my model automatically" must actually stop the switches.
  useEffect(() => {
    getDeviceGuard().setOverride({ neverSwitchModel: prefs.neverAutoSwitch, autoPowerManagement: prefs.autoPower, profile: prefs.performance });
  }, [prefs.neverAutoSwitch, prefs.autoPower, prefs.performance]);

  // A guard switch changes the engine's model without a vault event; consumers reading engine.model re-render through this tick.
  useEffect(() => subscribeEngineState(() => setBooted((b) => (b ? { ...b } : b))), []);

  // §7.5 auto-delete: at start, on every return to the foreground, hourly while open, and at once when the setting changes.
  const store = booted?.store ?? null;
  const retentionRun = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!store) return;
    const run = () => {
      const days = prefsRef.current.autoDeleteDays;
      // Two overlapping runs would open two SQLite transactions on one connection; the next tick re-checks anyway.
      if (!days || retentionRun.current) return;
      // The chat on screen is never pulled out from under the user (or a running answer); the next run after leaving it applies.
      const open = activeRef.current.id;
      if (__DEV__) console.log(`[retention] run · ${days} day(s) · open chat ${open ?? "none"}`);
      retentionRun.current = runRetention(store, days, open ? [open] : [])
        .then((ids) => {
          if (!ids.length) return;
          if (__DEV__) console.log(`[retention] deleted ${ids.length} chat(s) older than ${days} day(s): ${ids.join(", ")}`);
          setChatsVersion((v) => v + 1);
        })
        .catch((e: unknown) => console.warn("[retention]", e))
        .finally(() => {
          retentionRun.current = null;
        });
    };
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    const timer = setInterval(run, RETENTION_TICK_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [store, prefs.autoDeleteDays]);

  useEffect(() => {
    let alive = true;
    boot(prefsRef.current)
      .then((b) => {
        if (alive) setBooted(b);
        void getLicence();
      })
      .catch((e: unknown) => console.error("boot failed", e));
    return () => {
      alive = false;
    };
  }, [generation]);

  // Exit meter: fold the kernel counter into lifetime totals while in the foreground; persist at most every 5 s.
  useEffect(() => {
    if (meterKind() !== "counter") return;
    const tick = () => {
      if (AppState.currentState !== "active") return;
      const s = sample();
      if (!s) return;
      const before = prefsRef.current.meter;
      const after = accumulate(before, s);
      if (after === before) return;
      const now = Date.now();
      setPrefs((p) => ({ ...p, meter: after }));
      if (now - lastMeterWrite.current >= METER_WRITE_MS) {
        lastMeterWrite.current = now;
        writePrefsRaw({ ...prefsRef.current, meter: after });
      }
    };
    tick();
    const id = setInterval(tick, METER_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => networkLog.subscribe(() => setLogTick((n) => n + 1)), [networkLog]);

  // The vault's own requests (model bytes, Hugging Face search) reach the S50 log through the transfer bus.
  useEffect(() => {
    for (const r of drainTransfers()) networkLog.record(r);
    return subscribeTransfers((r) => networkLog.record(r));
  }, [networkLog]);

  // The vault drives the §8.8 "delivering" strip and the seal; on first launch the fast-follow pack hot-swaps the engine when it lands.
  useEffect(() => {
    if (Platform.OS === "web" || !booted) return;
    const vault = getVault();
    const update = () => {
      const chat = vault.entries().filter((e) => e.model.role === "chat");
      const live = chat.find((e) => e.state.kind === "delivering" && !e.state.paused) ?? chat.find((e) => e.state.kind === "verifying");
      const next: DeliveryState | null = !live
        ? null
        : live.state.kind === "delivering"
          ? { name: live.model.name.toUpperCase(), status: "delivering", progress: live.state.bytes / Math.max(1, live.state.total || live.model.bytes), totalBytes: live.state.total || live.model.bytes }
          : { name: live.model.name.toUpperCase(), status: "verifying", progress: 1, totalBytes: live.model.bytes };
      setDelivery((d) => (d?.status === next?.status && d?.name === next?.name && Math.round((d?.progress ?? 0) * 100) === Math.round((next?.progress ?? 0) * 100) ? d : next));
      /* Compared by file, not id: the vault re-resolves after every install ("fast" lands and outranks "instant"), while the engine keeps whatever it loaded at boot. A guard switch (§6.5) is a run-time override the vault must not undo. */
      const wanted = vault.activeModel()?.path;
      if (wanted && bootedRef.current && !hasSessionOverride() && bootedRef.current.engine.model.uri !== wanted) reloadWhenIdle();
    };
    update();
    return vault.subscribe(update);
  }, [booted, reloadWhenIdle]);

  const lockRef = useRef<AppLock | null>(null);
  const wipeAll = useCallback(async (opts: WipeOptions) => {
    await wipeLicence();
    /* Closed first: expo-sqlite refuses to delete a cached open file, and the next boot would be handed the old handle on the unlinked one (QA F15). */
    await bootedRef.current?.store.close().catch((e: unknown) => console.warn("[storage] close before wipe", e));
    await wipe(opts);
    await lockRef.current?.refresh();
    deletePrefs();
    const fresh = defaultPrefs(Date.now());
    writePrefsRaw(fresh);
    setPrefs(fresh);
    setActive({ id: null, incognito: false, key: 0 });
    setBooted(null);
    setGeneration((g) => g + 1);
  }, []);

  const lock = useAppLock({ prefs: prefs.lock, onWipe: () => void wipeAll({ models: false }) });
  lockRef.current = lock;

  const meter = useMemo<Meter>(() => {
    const kind = meterKind();
    const totals = networkLog.totals();
    if (kind === "counter") return { out: prefs.meter.outBytes, in: prefs.meter.inBytes, connections: totals.connections, kind, since: prefs.installedAt };
    const web = sample();
    return { out: totals.out, in: Math.max(totals.in, web?.rx ?? 0), connections: totals.connections, kind, since: prefs.installedAt };
    // logTick re-runs this when the session log grows.
  }, [prefs.meter, prefs.installedAt, networkLog, logTick]);

  const closeActive = useCallback(
    (store: ChatStore, a: ActiveChat) => {
      // An incognito chat is gone the moment the user leaves it (spec §5.7), not just when the app exits.
      if (a.incognito && a.id) store.deleteChat(a.id).catch((e: unknown) => console.warn("deleteChat", e));
    },
    [],
  );

  const value = useMemo<AppServices | null>(() => {
    if (!booted) return null;
    return {
      ...booted,
      prefs,
      updatePrefs,
      lock,
      captured,
      /* No model yet and a pack on its way: the seal shows "delivering" until the engine hot-swaps (§8.8). */
      sealState: booted.engine.model.id === "null" && (delivery?.status === "delivering" || delivery?.status === "verifying") ? "loading" : sealState,
      setSealState,
      networkLog,
      meter,
      active,
      openChat: (chat) => {
        setActive((a) => {
          if (chat.id !== a.id) closeActive(booted.store, a);
          return { id: chat.id, incognito: chat.incognito, key: a.key + 1 };
        });
      },
      newChat: (incognito, personaId) => {
        setActive((a) => {
          closeActive(booted.store, a);
          return { id: null, incognito, key: a.key + 1, ...(personaId ? { personaId } : {}) };
        });
      },
      chatCreated: (id) => setActive((a) => ({ ...a, id })),
      openShared: (payload) => {
        setActive((a) => {
          closeActive(booted.store, a);
          return { id: null, incognito: false, key: a.key + 1, seed: payload };
        });
      },
      seedConsumed: () => setActive((a) => (a.seed ? { ...a, seed: undefined } : a)),
      chatDeleted: (id) => setActive((a) => (a.id === id ? { id: null, incognito: false, key: a.key + 1 } : a)),
      chatsVersion,
      modelChanged: () => setBooted((b) => (b ? { ...b, engine: getEngine() } : b)),
      delivery,
      setDelivery,
      /* The guard swaps the engine's model through its resolver for this run only; the vault's default is untouched (§6.5: it returns at the next launch). */
      switchToInstant: () => getDeviceGuard().switchToInstant(),
      switchBack: () => getDeviceGuard().switchBack(),
      continueGeneration: () => getDeviceGuard().continueGeneration(),
      wipeAll,
    };
  }, [booted, prefs, updatePrefs, lock, captured, sealState, networkLog, meter, active, delivery, wipeAll, closeActive, chatsVersion]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
