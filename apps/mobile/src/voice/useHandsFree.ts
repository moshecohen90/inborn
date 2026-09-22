import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { SAFETY_BASELINE, VOICE_SYSTEM_HINT, buildPrompt, composeSystemPrompt, planAnswerLength, initialHandsFree, isEmptyTranscript, languageHint, nextHandsFree, safetyBaseline, screenText, titleFromFirstMessage, type ChatStore, type HandsFreeEffect, type HandsFreeEvent, type HandsFreeState, type Message } from "@inborn/core";
import { getEngine, loadSession } from "../engine";
import { useDeviceState } from "../device/useDeviceState";
import { UtteranceListener } from "./mic";
import { speak, stopSpeaking } from "./tts";
import { getWhisper } from "./whisper";
import { devUtter, devVoiceRecord } from "./devLive";


export interface HandsFreeTimings {
  transcribeMs?: number;
  answerMs?: number;
  ttsStartMs?: number;
  whisperLoadMs?: number;
}

export interface HandsFreeController {
  state: HandsFreeState;
  /** 0..1 input level while listening, for the seal's wave. */
  level: number;
  /** Whether the current frame is judged as speech. */
  speaking: boolean;
  timings: HandsFreeTimings;
  /** Tap anywhere: interrupt (speaking / thinking) or close the utterance (listening). */
  tap: () => void;
  end: () => void;
  /** Chat id once the first turn was saved (null in incognito or before the first turn). */
  chatId: string | null;
}

interface Options {
  store: ChatStore;
  chatId: string | null;
  incognito: boolean;
  modelId: string;
  uiLocale: string;
  /** Family-safe mode (§11.1 Guideline 1.2). The spoken loop screens the same way the typed one does. */
  familySafe: boolean;
  /** What is said instead, already translated: this hook has no `t`. */
  familySafeText: string;
  onChatCreated?: (id: string) => void;
}

/**
 * Drives the pure §S44 reducer with the phone's parts: mic + energy VAD → whisper → the chat engine → system TTS.
 * Every turn is saved to the chat like a typed one (never in incognito); the device guard's pause and the
 * background pause the loop, "tap to interrupt" cuts the model off mid-sentence.
 */
export function useHandsFree({ store, chatId: initialChatId, incognito, modelId, uiLocale, familySafe, familySafeText, onChatCreated }: Options): HandsFreeController {
  const [state, setState] = useState<HandsFreeState>(initialHandsFree);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [timings, setTimings] = useState<HandsFreeTimings>({});
  const stateRef = useRef(state);
  const listener = useRef<UtteranceListener | null>(null);
  const generation = useRef<AbortController | null>(null);
  const transcription = useRef<AbortController | null>(null);
  const chatRef = useRef<string | null>(initialChatId);
  const lastAudio = useRef<{ samples: Float32Array; ms: number } | null>(null);
  const device = useDeviceState();
  const alive = useRef(true);

  const dispatch = useCallback((event: HandsFreeEvent) => {
    if (!alive.current) return;
    const r = nextHandsFree(stateRef.current, event);
    stateRef.current = r.state;
    setState(r.state);
    for (const effect of r.effects) void run(effect);
  }, []);

  const ensureChat = useCallback(
    async (firstText: string): Promise<string | null> => {
      if (chatRef.current) return chatRef.current;
      const created = await store.createChat({ modelId, incognito, title: titleFromFirstMessage(firstText) });
      chatRef.current = created.id;
      onChatCreated?.(created.id);
      return created.id;
    },
    [store, modelId, incognito, onChatCreated],
  );

  const run = async (effect: HandsFreeEffect): Promise<void> => {
    try {
      switch (effect.type) {
        case "listen": {
          const l = (listener.current ??= new UtteranceListener({
            onLevel: (db, isSpeech) => {
              setLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
              setSpeaking(isSpeech);
            },
            onError: (m) => dispatch({ type: "error", message: m }),
          }));
          /* The whisper weights load while the user speaks, so the first transcription pays nothing extra. */
          void getWhisper()
            .load()
            .then(() => setTimings((t) => ({ ...t, whisperLoadMs: getWhisper().loadMs })))
            .catch((e: unknown) => dispatch({ type: "error", message: e instanceof Error ? e.message : String(e) }));
          devUtter("handsFree");
          const listenedAt = Date.now();
          const audio = await l.listen();
          devVoiceRecord("handsFree.listen", { waitedMs: Date.now() - listenedAt, audioMs: audio?.ms ?? null });
          setSpeaking(false);
          setLevel(0);
          if (stateRef.current.phase !== "listening") return;
          if (!audio) return dispatch({ type: "no-speech" });
          lastAudio.current = audio;
          dispatch({ type: "speech-end", audioMs: audio.ms });
          return;
        }
        case "stop-listening":
          await listener.current?.cancel();
          return;
        case "transcribe": {
          const audio = lastAudio.current;
          if (!audio) return dispatch({ type: "no-speech" });
          const ac = new AbortController();
          transcription.current = ac;
          const r = await getWhisper().transcribe(audio.samples, { signal: ac.signal });
          transcription.current = null;
          if (ac.signal.aborted) return;
          setTimings((t) => ({ ...t, transcribeMs: r.ms }));
          devVoiceRecord("handsFree.stt", { whisperLoadMs: getWhisper().loadMs, transcribeMs: r.ms, language: r.whisperLanguage, text: r.text });
          if (isEmptyTranscript(r.text)) return dispatch({ type: "no-speech" });
          dispatch({ type: "transcript", text: r.text, ...(r.language ? { language: r.language } : {}) });
          return;
        }
        case "generate": {
          const ac = new AbortController();
          generation.current = ac;
          const started = Date.now();
          const id = await ensureChat(effect.text);
          if (id) await store.appendMessage({ chatId: id, role: "user", content: effect.text });
          const turns: Message[] = stateRef.current.turns.map((t) => ({ role: t.role, content: t.text }));
          /* Answers stay short in a spoken exchange (S44); the loop never waits on a 1,024-token reply (F38). */
          const length = planAnswerLength({ text: effect.text, use: "voice", spoken: true });
          /* F50: the spoken turn is refused before generation, so nothing prohibited is ever synthesised aloud. */
          if (screenText(effect.text, familySafe).flagged) {
            generation.current = null;
            if (id) await store.appendMessage({ chatId: id, role: "assistant", content: familySafeText, modelId, safety: "family-safe" });
            dispatch({ type: "answer", text: familySafeText });
            return;
          }
          const system = composeSystemPrompt({ baseline: `${safetyBaseline(SAFETY_BASELINE, familySafe)}\n${VOICE_SYSTEM_HINT}`, languageHint: languageHint(effect.text), length: length.instruction });
          const session = await loadSession();
          const prompt = buildPrompt({ system, messages: turns.map((m, i) => ({ id: String(i), ...m })), nCtx: session.nCtx, reserve: length.maxTokens });
          let reply = "";
          const { engine } = getEngine();
          for await (const d of engine.generate(session, prompt.messages, { reasoning: false, maxTokens: length.maxTokens, temperature: 0.6 }, ac.signal)) {
            if (d.text) {
              reply += d.text;
              const snapshot = reply;
              if (stateRef.current.phase === "thinking") setState((s) => ({ ...s, live: snapshot }));
            }
          }
          generation.current = null;
          if (ac.signal.aborted) return;
          setTimings((t) => ({ ...t, answerMs: Date.now() - started }));
          devVoiceRecord("handsFree.answer", { answerMs: Date.now() - started, text: reply.trim() });
          const replaced = screenText(reply, familySafe).flagged;
          if (replaced) reply = familySafeText;
          if (id && reply.trim()) await store.appendMessage({ chatId: id, role: "assistant", content: reply.trim(), modelId, ...(replaced ? { safety: "family-safe" as const } : {}) });
          dispatch({ type: "answer", text: reply });
          return;
        }
        case "stop-generating":
          generation.current?.abort();
          generation.current = null;
          transcription.current?.abort();
          transcription.current = null;
          return;
        case "speak": {
          const started = Date.now();
          await speak(effect.text, {
            uiLocale,
            onStart: () => {
              setTimings((t) => ({ ...t, ttsStartMs: Date.now() - started }));
              devVoiceRecord("handsFree.tts", { ttsStartMs: Date.now() - started });
            },
          });
          if (stateRef.current.phase === "speaking") dispatch({ type: "spoken" });
          return;
        }
        case "stop-speaking":
          await stopSpeaking();
          return;
        case "end":
          await listener.current?.cancel();
          await stopSpeaking();
          return;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "aborted") return;
      devVoiceRecord("handsFree.error", { effect: effect.type, message });
      dispatch({ type: "error", message });
    }
  };

  useEffect(() => {
    alive.current = true;
    dispatch({ type: "start" });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") dispatch({ type: "pause", reason: "background" });
      else if (s === "active" && stateRef.current.pausedFor === "background") dispatch({ type: "resume" });
    });
    return () => {
      alive.current = false;
      sub.remove();
      const r = nextHandsFree(stateRef.current, { type: "stop" });
      stateRef.current = r.state;
      void listener.current?.cancel();
      listener.current?.release();
      listener.current = null;
      generation.current?.abort();
      transcription.current?.abort();
      void stopSpeaking();
      void getWhisper().unload();
    };
  }, [dispatch]);

  /* The device guard's pause (critical heat, memory) stops the loop the same way it stops a typed answer (§6.5). */
  useEffect(() => {
    const rec = device.recommendation;
    if (rec.kind === "pause") dispatch({ type: "pause", reason: rec.reason });
    else if (stateRef.current.phase === "paused" && (stateRef.current.pausedFor === "thermal" || stateRef.current.pausedFor === "memory")) dispatch({ type: "resume" });
  }, [device.recommendation, dispatch]);

  const tap = useCallback(() => {
    if (stateRef.current.phase === "listening") void listener.current?.flush();
    else dispatch({ type: "interrupt" });
  }, [dispatch]);
  const end = useCallback(() => dispatch({ type: "stop" }), [dispatch]);

  return { state, level, speaking, timings, tap, end, chatId: chatRef.current };
}
