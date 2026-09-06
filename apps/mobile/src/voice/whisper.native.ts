import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
/* "whisper.rn/index": the package exports map has no "." entry, so the bare name does not resolve for TypeScript. */
import { initWhisper, type WhisperContext } from "whisper.rn/index";
import { bcp47FromWhisper, cleanTranscript } from "@inborn/core";
import { getVault } from "../vault/store";

/** Catalog id of the on-device transcription companion (spec §6.2: whisper.cpp base, 142 MB). */
export const WHISPER_MODEL_ID = "speech-whisper-base";
/** M1-style dev fallback: the ggml file pushed by hand as Documents/whisper.bin. */
export const DEV_WHISPER_FILE = "whisper.bin";

export interface Transcription {
  text: string;
  /** BCP 47 when whisper's detected language is known, else undefined. */
  language?: string;
  whisperLanguage: string;
  ms: number;
}

export function resolveWhisper(): string | null {
  const state = getVault().state(WHISPER_MODEL_ID);
  if (state.kind === "ready") return state.path;
  const dev = new File(Paths.document, DEV_WHISPER_FILE);
  return dev.exists ? dev.uri : null;
}

export const whisperInstalled = (): boolean => resolveWhisper() !== null;

/** Starts the vault delivery (Play pack on Android, HTTPS on iOS); the vault screens show progress. */
export function installWhisper(): Promise<unknown> {
  return getVault().install(WHISPER_MODEL_ID);
}

/**
 * One whisper.cpp context for the app: loaded on first use, released by `unload()` (memory pressure, or the
 * hands-free screen closing). Metal on iPhones; the simulator and Android decode on the CPU.
 */
class WhisperEngine {
  private ctx: WhisperContext | null = null;
  private loading: Promise<WhisperContext> | null = null;
  private path: string | null = null;
  loadMs = 0;

  async load(): Promise<WhisperContext> {
    const path = resolveWhisper();
    if (!path) throw new Error("whisper-not-installed");
    if (this.ctx && this.path === path) return this.ctx;
    if (this.loading) return this.loading;
    const started = Date.now();
    this.loading = initWhisper({ filePath: path, useGpu: Platform.OS === "ios", useCoreMLIos: false })
      .then((ctx) => {
        this.ctx = ctx;
        this.path = path;
        this.loadMs = Date.now() - started;
        if (__DEV__) console.log(`[voice] whisper loaded ${path} in ${this.loadMs} ms (gpu ${ctx.gpu}${ctx.reasonNoGPU ? `: ${ctx.reasonNoGPU}` : ""})`);
        return ctx;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  isLoaded(): boolean {
    return this.ctx !== null;
  }

  /** Float32 mono 16 kHz PCM → text, language auto-detected (Hebrew included). */
  async transcribe(samples: Float32Array, opts: { language?: string; signal?: AbortSignal } = {}): Promise<Transcription> {
    const ctx = await this.load();
    const started = Date.now();
    const buffer = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength) as ArrayBuffer;
    const { stop, promise } = ctx.transcribeData(buffer, { language: opts.language ?? "auto", maxThreads: 4, temperature: 0, beamSize: 1 });
    const onAbort = () => void stop();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const r = await promise;
      return { text: cleanTranscript(r.result), whisperLanguage: r.language, language: bcp47FromWhisper(r.language), ms: Date.now() - started };
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  /** A WAV on disk (the dev proof, or a recording); `file://` URIs are what whisper.rn expects. */
  async transcribeFile(uri: string, opts: { language?: string } = {}): Promise<Transcription> {
    const ctx = await this.load();
    const started = Date.now();
    const r = await ctx.transcribe(uri, { language: opts.language ?? "auto", maxThreads: 4, temperature: 0, beamSize: 1 }).promise;
    return { text: cleanTranscript(r.result), whisperLanguage: r.language, language: bcp47FromWhisper(r.language), ms: Date.now() - started };
  }

  async unload(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    this.path = null;
    if (ctx) await ctx.release();
  }
}

let engine: WhisperEngine | null = null;
export const getWhisper = (): WhisperEngine => (engine ??= new WhisperEngine());
