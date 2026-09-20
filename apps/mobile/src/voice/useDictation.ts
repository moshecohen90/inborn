import { useCallback, useEffect, useRef, useState } from "react";
import { TranscriptMerger, chooseDictation, joinDictation, shouldRetryDictationStart, type DictationEngine, type LicenceTier } from "@inborn/core";
import { installOfflineDictation, requestMicPermission, startSystemDictation, systemDictationStatus, systemDictationSupported, type DictationHandle } from "./dictation";
import { MicRecorder, micAvailable } from "./mic";
import { getWhisper, whisperInstalled } from "./whisper";
import { devUtter, devVoiceRecord } from "./devLive";
import { DEV_AUTOVOICE_DICTATE } from "./devFlags";

export type DictationPhase = { kind: "idle" } | { kind: "starting" } | { kind: "listening"; engine: DictationEngine } | { kind: "transcribing" };

/** Why the mic could not start; the chat screen turns each into a sheet or a toast. */
export type DictationProblem =
  | { kind: "permission" }
  /** The system recogniser has no offline pack for the locale (Android) or no on-device support for it (iOS). */
  | { kind: "offline-missing"; locale: string; canInstall: boolean; whisperIsPro: boolean }
  /** Pro user, whisper chosen, companion not in the vault. */
  | { kind: "whisper-missing" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

export interface DictationController {
  phase: DictationPhase;
  /** Input level while whisper records (dBFS), for the pulsing border. */
  level: number;
  problem: DictationProblem | null;
  clearProblem: () => void;
  /** Tap on the mic: start, or stop when listening. */
  toggle: () => void;
  stop: () => void;
  /** Android 13+: opens the system's offline pack download for the locale. */
  installOffline: (locale: string) => Promise<void>;
  /** Dev builds only: transcribe a WAV and hand it to the composer as if it had been spoken; null when the hook is off. */
  dictateFile: (uri: string) => Promise<string | null>;
}

interface Options {
  draft: string;
  setDraft: (text: string) => void;
  tier: LicenceTier;
  locale: string;
  /** Pro users may force whisper (a language the system cannot do on-device). */
  preferWhisper?: boolean;
  /** Called with the final text once a session ends (the composer may auto-send in hands-free later). */
  onFinal?: (text: string) => void;
}

/** The composer's mic (§8.2): tap to listen, tap again to stop; live partial text lands in the draft as it is recognised. */
export function useDictation({ draft, setDraft, tier, locale, preferWhisper, onFinal }: Options): DictationController {
  const [phase, setPhase] = useState<DictationPhase>({ kind: "idle" });
  const [level, setLevel] = useState(-100);
  const [problem, setProblem] = useState<DictationProblem | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const system = useRef<DictationHandle | null>(null);
  const canInstallOffline = useRef(false);
  /* Read at start time: the screen flips the preference and toggles in the same tick, before React re-renders. */
  const preferRef = useRef(preferWhisper);
  preferRef.current = preferWhisper;
  const recorder = useRef<MicRecorder | null>(null);
  /* Loudest frame of the last whisper recording (dBFS): the dev proof tells "silent stream" from "too quiet". */
  const peak = useRef<() => number>(() => -100);
  const abort = useRef<AbortController | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /* Every final transcript leaves through here, so the dev hook below travels the same path as the mic (QA round 12). */
  const deliver = useCallback(
    (text: string) => {
      setDraft(text);
      onFinal?.(text);
    },
    [setDraft, onFinal],
  );

  const finishSystem = useCallback(() => {
    system.current = null;
    setPhase({ kind: "idle" });
  }, []);

  const startSystem = useCallback((attempt = 0) => {
    const merger = new TranscriptMerger(draftRef.current);
    setPhase({ kind: "listening", engine: "system" });
    const startedAt = Date.now();
    let firstInterimMs: number | undefined;
    let retryPending = false;
    system.current = startSystemDictation(locale, {
      onInterim: (text) => {
        firstInterimMs ??= Date.now() - startedAt;
        merger.setInterim(text);
        setDraft(merger.text());
      },
      onFinal: (text) => {
        merger.commit(text);
        setDraft(merger.text());
      },
      onEnd: () => {
        if (retryPending) {
          system.current = null;
          startSystem(attempt + 1);
          return;
        }
        const text = merger.finish();
        devVoiceRecord("dictation", { engine: "system", locale, firstInterimMs, totalMs: Date.now() - startedAt, text });
        deliver(text);
        finishSystem();
      },
      onError: (code, message) => {
        const afterMs = Date.now() - startedAt;
        devVoiceRecord("dictationError", { code, message, afterMs, attempt });
        /* The first start after the permission grant loses the audio session to the closing alert; start again, silently. */
        if (shouldRetryDictationStart({ code, afterMs, attempt })) {
          retryPending = true;
          return;
        }
        if (code === "no-speech" || code === "aborted" || code === "speech-timeout") return;
        if (code === "not-allowed") setProblem({ kind: "permission" });
        /* "client" is what Android's on-device service answers when the locale's pack was never downloaded, even though it lists the locale. */
        else if (code === "language-not-supported" || code === "service-not-allowed" || code === "client") setProblem({ kind: "offline-missing", locale, canInstall: canInstallOffline.current, whisperIsPro: tier === "free" });
        else if (code !== "unsupported") setProblem({ kind: "error", message });
        finishSystem();
      },
    });
    devUtter("dictation");
  }, [locale, setDraft, deliver, tier, finishSystem]);

  const stopWhisper = useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    await rec.stop();
    const audio = rec.take();
    rec.release();
    if (audio.ms < 300) {
      setPhase({ kind: "idle" });
      return;
    }
    setPhase({ kind: "transcribing" });
    const ac = new AbortController();
    abort.current = ac;
    try {
      const r = await getWhisper().transcribe(audio.samples, { signal: ac.signal });
      devVoiceRecord("whisper", { loadMs: getWhisper().loadMs, audioMs: audio.ms, peakDb: peak.current(), transcribeMs: r.ms, language: r.whisperLanguage, text: r.text });
      if (!ac.signal.aborted) deliver(joinDictation(draftRef.current, r.text));
    } catch (e: unknown) {
      setProblem({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      abort.current = null;
      setPhase({ kind: "idle" });
    }
  }, [deliver]);

  const startWhisper = useCallback(async () => {
    let peakDb = -100;
    const rec = new MicRecorder({
      onFrame: (_f, db) => {
        peakDb = Math.max(peakDb, db);
        setLevel(db);
      },
      onError: (m) => setProblem({ kind: "error", message: m }),
    });
    recorder.current = rec;
    peak.current = () => peakDb;
    try {
      /* Warm the model while the user speaks so transcription starts the moment they stop. */
      void getWhisper().load().catch(() => undefined);
      await rec.start();
      setPhase({ kind: "listening", engine: "whisper" });
      devUtter("whisper");
    } catch (e: unknown) {
      recorder.current = null;
      setProblem({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      setPhase({ kind: "idle" });
    }
  }, []);

  const start = useCallback(async () => {
    setProblem(null);
    setPhase({ kind: "starting" });
    if (!systemDictationSupported() && !micAvailable()) {
      setProblem({ kind: "unsupported" });
      setPhase({ kind: "idle" });
      return;
    }
    if (!(await requestMicPermission())) {
      setProblem({ kind: "permission" });
      setPhase({ kind: "idle" });
      return;
    }
    const status = await systemDictationStatus(locale);
    canInstallOffline.current = status.canInstallOffline;
    const choice = chooseDictation({ tier, systemAvailable: status.available, systemOnDevice: status.onDevice, whisperReady: whisperInstalled(), preferWhisper: preferRef.current });
    if (choice.engine !== null) return choice.engine === "system" ? startSystem() : startWhisper();
    setPhase({ kind: "idle" });
    switch (choice.reason) {
      case "system-offline-missing":
        return setProblem({ kind: "offline-missing", locale, canInstall: status.canInstallOffline, whisperIsPro: true });
      case "whisper-not-installed":
        return setProblem(status.available && !status.onDevice ? { kind: "offline-missing", locale, canInstall: status.canInstallOffline, whisperIsPro: false } : { kind: "whisper-missing" });
      case "system-unavailable":
      case "unsupported-platform":
        return setProblem({ kind: "unsupported" });
    }
  }, [locale, tier, startSystem, startWhisper]);

  const stop = useCallback(() => {
    if (system.current) system.current.stop();
    else if (recorder.current) void stopWhisper();
    else if (abort.current) abort.current.abort();
  }, [stopWhisper]);

  const toggle = useCallback(() => {
    const p = phaseRef.current;
    if (p.kind === "listening") stop();
    else if (p.kind === "idle") void start();
  }, [start, stop]);

  useEffect(
    () => () => {
      system.current?.abort();
      void recorder.current?.stop();
      abort.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (problem) devVoiceRecord("problem", problem);
  }, [problem]);

  const installOffline = useCallback(async (loc: string) => {
    setProblem(null);
    await installOfflineDictation(loc);
  }, []);

  /**
   * Dev builds only: a fixture takes the place of the microphone. The transcript is merged into the draft and announced
   * exactly as a spoken one is, so the send that follows counts as dictated (§7.8) on a device with no speech service.
   */
  const dictateFile = useCallback(
    async (uri: string): Promise<string | null> => {
      if (!DEV_AUTOVOICE_DICTATE) return null;
      setPhase({ kind: "transcribing" });
      try {
        const r = await getWhisper().transcribeFile(uri);
        const text = joinDictation(draftRef.current, r.text);
        deliver(text);
        return text;
      } catch (e: unknown) {
        setProblem({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        return null;
      } finally {
        setPhase({ kind: "idle" });
      }
    },
    [deliver],
  );

  return { phase, level, problem, clearProblem: () => setProblem(null), toggle, stop, installOffline, dictateFile };
}
