import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { getLocales } from "expo-localization";
import { i18next, initI18n } from "@inborn/i18n";
import { accumulate, ChatStore, InMemoryChatRepository, NetworkLog, type Chat, type ChatRepository } from "@inborn/core";
import { prepareEngine, type Engine } from "../adapters";
import { getEngine, resetEngine } from "../engine";
import { getVault } from "../vault/store";
import { openPersistentStorage } from "../storage/persistent";
import type { PersistenceKind } from "../storage/types";
import { wipe, type WipeOptions } from "../storage/wipe";
import { getLicence, wipeLicence } from "../licence";
import { useAppLock, type AppLock } from "../lock/useAppLock";
import { isCaptured, onCapturedChange, setSecure } from "../../modules/secure-screen";
import { meterKind, sample, type MeterKind } from "../proof/meterSource";
import type { SealState } from "../components/Seal";
import { defaultPrefs, mergePrefs, type Prefs } from "./prefsTypes";
import { deletePrefs, readPrefsRaw, writePrefsRaw } from "./prefsStore";
import { applyThemeMode } from "./theme";

/** `key` remounts the chat screen whenever a different conversation is opened. */
export interface ActiveChat {
  id: string | null;
  incognito: boolean;
  key: number;
  /** Persona chosen in the new-chat sheet for a chat that does not exist yet. */
  personaId?: string;
}

/** Filled by the vault stream while the store/system delivers a model (§8.8 "model delivering"). */
export interface DeliveryState {
  name: string;
  status: "idle" | "delivering" | "done" | "failed";
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
  await Promise.all([initI18n(prefs.locale ?? tags[0] ?? "en", tags), prepareEngine()]);
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
  const networkLog = useMemo(() => new NetworkLog(), []);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const lastMeterWrite = useRef(0);
  const bootedRef = useRef(booted);
  bootedRef.current = booted;
  const previousModel = useRef<string | null>(null);
  const swapping = useRef(false);

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
          : { name: live.model.name.toUpperCase(), status: "delivering", progress: 1, totalBytes: live.model.bytes };
      setDelivery((d) => (d?.status === next?.status && d?.name === next?.name && Math.round((d?.progress ?? 0) * 100) === Math.round((next?.progress ?? 0) * 100) ? d : next));
      if (bootedRef.current?.engine.model.id === "null" && vault.activeModel()) void reloadEngine();
    };
    update();
    return vault.subscribe(update);
  }, [booted, reloadEngine]);

  const wipeAll = useCallback(async (opts: WipeOptions) => {
    await wipeLicence();
    await wipe(opts);
    deletePrefs();
    const fresh = defaultPrefs(Date.now());
    writePrefsRaw(fresh);
    setPrefs(fresh);
    setActive({ id: null, incognito: false, key: 0 });
    setBooted(null);
    setGeneration((g) => g + 1);
  }, []);

  const lock = useAppLock({ prefs: prefs.lock, onWipe: () => void wipeAll({ models: false }) });

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
      sealState: booted.engine.model.id === "null" && delivery?.status === "delivering" ? "loading" : sealState,
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
      chatDeleted: (id) => setActive((a) => (a.id === id ? { id: null, incognito: false, key: a.key + 1 } : a)),
      modelChanged: () => setBooted((b) => (b ? { ...b, engine: getEngine() } : b)),
      delivery,
      setDelivery,
      switchToInstant: () => {
        const vault = getVault();
        if (Platform.OS === "web" || vault.state("instant").kind !== "ready") return;
        const current = vault.activeModel()?.model.id ?? null;
        if (current === "instant") return;
        previousModel.current = current;
        vault.setDefault("instant");
        void reloadEngine();
      },
      switchBack: () => {
        const id = previousModel.current;
        if (!id || Platform.OS === "web") return;
        previousModel.current = null;
        getVault().setDefault(id);
        void reloadEngine();
      },
      /* Resuming after a thermal/memory pause belongs to the device-guard stream (§8.8). */
      continueGeneration: () => console.log("[inborn] continue generation requested"),
      wipeAll,
    };
  }, [booted, prefs, updatePrefs, lock, captured, sealState, networkLog, meter, active, delivery, wipeAll, closeActive, reloadEngine]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
