/* Desktop (Tauri v2): the same LocalLM and ChatRepository contracts, served by the Rust side over Tauri's IPC.
   IPC is not a socket (`ipc:` / `http://ipc.localhost` are in-process schemes); the webview still has no network. */
import {
  SEARCH_LIMIT,
  matchesTerms,
  newId,
  searchTerms,
  snippetAround,
  type Capabilities,
  type Chat,
  type ChatMessage,
  type ChatRepository,
  type Delta,
  type GenOpts,
  type LoadOptions,
  type LocalLM,
  type Message,
  type MessagePatch,
  type ModelRef,
  type NewChat,
  type NewMessage,
  type SearchHit,
  type Session,
  type Stats,
  type Usage,
} from "@inborn/core";
import { FTS_SQL, SCHEMA_SQL, SQL, ftsQuery } from "../storage/schema";
import type { Engine } from "./index";

type Channel<T> = { onmessage: (message: T) => void };
interface TauriGlobal {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>; Channel: new <T>() => Channel<T> };
  event: { listen<T>(name: string, handler: (event: { payload: T }) => void): Promise<() => void> };
}
declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export interface ModelFile {
  id: string;
  path: string;
  sizeBytes: number;
}
export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
  dir: string;
}
export interface LoadedInfo {
  loadMs: number;
  nCtx: number;
  nCtxTrain: number;
  gpu: boolean;
  backend: string;
  threads: number;
  desc: string;
  sizeMb: number;
  nParams: number;
}
export interface SealState {
  sealed: boolean;
  note: string;
  outBytes: number;
}
type WireDelta = Delta & { error?: string };
type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;

export const isTauri = (): boolean => typeof window !== "undefined" && !!window.__TAURI__;

function tauri(): TauriGlobal {
  const t = typeof window !== "undefined" ? window.__TAURI__ : undefined;
  if (!t) throw new Error("not running inside the Inborn desktop shell");
  return t;
}
const invoke = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => tauri().core.invoke<T>(cmd, args);

/** Native llama.cpp (Metal / Vulkan / CUDA) in the Rust side of the shell; tokens stream back over an IPC channel. */
export class TauriLM implements LocalLM {
  readonly id = "tauri" as const;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };
  devInfo: Record<string, unknown> = {};

  capabilities(): Capabilities {
    return { vision: false, tools: false, embeddings: false, maxContext: this.session?.nCtx ?? 4096 };
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    await this.unload();
    const info = await invoke<LoadedInfo>("lm_load", { request: { path: model.uri, nCtx: opts.nCtx, gpuLayers: opts.gpuLayers, threads: opts.threads } });
    this.devInfo = { ...info };
    this.last = { ...this.last, memMB: info.sizeMb };
    this.session = { model, nCtx: info.nCtx };
    console.info(`[tauri] loaded ${model.id} in ${info.loadMs} ms · backend=${info.backend} gpu=${info.gpu} threads=${info.threads} nCtx=${info.nCtx}`);
    return this.session;
  }

  async unload(): Promise<void> {
    if (!this.session) return;
    this.session = null;
    await invoke("lm_unload");
  }

  async *generate(session: Session, messages: Message[], opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta> {
    if (session !== this.session) throw new Error("model not loaded");
    const queue: Delta[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let sawDone = false;
    let failure: unknown = null;
    const channel = new (tauri().core.Channel)<WireDelta>();
    channel.onmessage = (d) => {
      if (d.error) failure = new Error(d.error);
      else queue.push(d);
      if (d.done) sawDone = true;
      wake?.();
    };
    const onAbort = () => void invoke("lm_abort").catch(() => undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    invoke<Usage>("lm_generate", {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      opts: { maxTokens: opts.maxTokens ?? 1024, temperature: opts.temperature ?? 0.7, topP: opts.topP ?? 0.9, stop: opts.stop, reasoning: opts.reasoning ?? true },
      onDelta: channel,
    })
      .then((usage) => {
        this.last = { tokPerSec: usage.tokPerSec, ttftMs: usage.ttftMs, ctxUsed: usage.promptTokens + usage.completionTokens, memMB: this.last.memMB };
      })
      .catch((e: unknown) => {
        failure = e;
      })
      .finally(() => {
        finished = true;
        wake?.();
      });
    /* The command resolves over a different IPC message than the channel; give the trailing `done` delta a moment to land. */
    let graceTicks = 40;
    try {
      while (true) {
        const d = queue.shift();
        if (d) {
          yield d;
          if (d.done) return;
          continue;
        }
        if (failure) throw failure;
        if (finished && (sawDone || graceTicks-- <= 0)) return;
        await new Promise<void>((r) => {
          wake = r;
          if (finished) setTimeout(r, 50);
        });
        wake = null;
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  async embed(): Promise<Float32Array[]> {
    throw new Error("tauri: embeddings need an embeddings session; the chat session cannot embed");
  }

  stats(): Stats {
    return this.last;
  }
}

type ChatRow = { id: string; title: string; created_at: number; updated_at: number; model_id: string; persona_id: string | null; pinned: number; folder_id: string | null };
type MessageRow = { id: string; chat_id: string; role: ChatMessage["role"]; content: string; reasoning: string | null; model_id: string | null; created_at: number; stopped: number; usage_json: string | null };
type SearchRow = { chat_id: string; id: string; content: string };

const toChat = (r: ChatRow): Chat => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  modelId: r.model_id,
  incognito: false,
  ...(r.persona_id ? { personaId: r.persona_id } : {}),
  ...(r.pinned ? { pinned: true } : {}),
  ...(r.folder_id ? { folderId: r.folder_id } : {}),
});

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
  ...(r.reasoning !== null ? { reasoning: r.reasoning } : {}),
  ...(r.model_id ? { modelId: r.model_id } : {}),
  ...(r.stopped ? { stopped: true } : {}),
  ...(r.usage_json ? { usage: JSON.parse(r.usage_json) as Usage } : {}),
});

const all = <T extends Row>(sql: string, params: SqlValue[] = []): Promise<T[]> => invoke<T[]>("db_all", { sql, params });
const run = (sql: string, params: SqlValue[] = []): Promise<number> => invoke<number>("db_run", { sql, params });
const batch = (statements: { sql: string; params: SqlValue[] }[]): Promise<number[]> => invoke<number[]>("db_batch", { statements });

/** SQLCipher on the Rust side (same schema and SQL as the phones); the key lives in the OS keychain. Refuses incognito rows. */
export class TauriChatRepository implements ChatRepository {
  private constructor(readonly fts: boolean) {}

  static async open(): Promise<TauriChatRepository> {
    await invoke<{ kind: string; fts: boolean }>("db_open");
    await invoke("db_exec", { sql: SCHEMA_SQL });
    let fts = true;
    try {
      await invoke("db_exec", { sql: FTS_SQL });
    } catch {
      fts = false;
    }
    return new TauriChatRepository(fts);
  }

  async listChats(): Promise<Chat[]> {
    return (await all<ChatRow>(SQL.listChats)).map(toChat);
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const row = (await all<ChatRow>(SQL.getChat, [id]))[0];
    return row ? toChat(row) : undefined;
  }

  async createChat(input: NewChat): Promise<Chat> {
    if (input.incognito) throw new Error("incognito chats are RAM-only and never written to disk");
    const now = Date.now();
    const chat: Chat = {
      id: newId(),
      title: (input.title ?? "").trim(),
      createdAt: now,
      updatedAt: now,
      modelId: input.modelId,
      incognito: false,
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.pinned ? { pinned: true } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
    };
    await run(SQL.insertChat, [chat.id, chat.title, now, now, chat.modelId, input.personaId ?? null, input.pinned ? 1 : 0, input.folderId ?? null]);
    return chat;
  }

  async renameChat(id: string, title: string): Promise<void> {
    await run(SQL.renameChat, [title.trim(), id]);
  }

  async deleteChat(id: string): Promise<void> {
    await batch([
      { sql: SQL.deleteMessagesOfChat, params: [id] },
      { sql: SQL.deleteChat, params: [id] },
    ]);
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    return (await all<MessageRow>(SQL.listMessages, [chatId])).map(toMessage);
  }

  async appendMessage(input: NewMessage): Promise<ChatMessage> {
    const now = Date.now();
    const message: ChatMessage = {
      id: newId(),
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      createdAt: now,
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
    };
    const touched = await run(SQL.touchChat, [now, input.chatId]);
    if (touched === 0) throw new Error(`unknown chat ${input.chatId}`);
    await run(SQL.insertMessage, [
      message.id,
      message.chatId,
      message.role,
      message.content,
      input.reasoning ?? null,
      input.modelId ?? null,
      now,
      input.stopped ? 1 : 0,
      input.usage ? JSON.stringify(input.usage) : null,
    ]);
    return message;
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const columns: [string, SqlValue][] = [];
    if (patch.content !== undefined) columns.push(["content", patch.content]);
    if (patch.reasoning !== undefined) columns.push(["reasoning", patch.reasoning]);
    if (patch.stopped !== undefined) columns.push(["stopped", patch.stopped ? 1 : 0]);
    if (patch.usage !== undefined) columns.push(["usage_json", JSON.stringify(patch.usage)]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    await run(`UPDATE messages SET ${sets} WHERE id = ? AND chat_id = ?`, [...columns.map(([, v]) => v), messageId, chatId]);
  }

  async search(query: string): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    const first = terms[0];
    if (!first) return [];
    const chats = await this.listChats();
    const titles = new Map(chats.map((c) => [c.id, c.title]));
    const hits: SearchHit[] = chats.filter((c) => matchesTerms(c.title, terms)).map((c) => ({ chatId: c.id, title: c.title, snippet: c.title }));
    const rows = this.fts
      ? await all<SearchRow>(SQL.searchFts, [ftsQuery(terms), SEARCH_LIMIT])
      : (await all<SearchRow>(SQL.searchLike, [`%${first}%`, SEARCH_LIMIT * 4])).filter((r) => matchesTerms(r.content, terms));
    for (const r of rows) hits.push({ chatId: r.chat_id, title: titles.get(r.chat_id) ?? "", messageId: r.id, snippet: snippetAround(r.content, terms) });
    return hits.slice(0, SEARCH_LIMIT);
  }
}

/* --- desktop surface: vault, seal, shortcuts, updater --- */

export const listModels = (): Promise<ModelFile[]> => invoke<ModelFile[]>("models_list");
export const diskSpace = (): Promise<DiskSpace> => invoke<DiskSpace>("models_space");
export const importModel = (source: string): Promise<ModelFile> => invoke<ModelFile>("models_import", { source });
export const pickModel = (): Promise<void> => invoke("models_pick");
export const removeModel = (id: string): Promise<void> => invoke("models_remove", { id });
export const sealState = (): Promise<SealState> => invoke<SealState>("seal_state");
export const checkForUpdates = (): Promise<{ available: boolean; currentVersion: string; version: string | null; notes: string | null }> => invoke("updater_check");
export const installUpdate = (): Promise<void> => invoke("updater_install");

export type DesktopShortcut = "new-chat" | "new-incognito" | "toggle-incognito" | "focus-composer" | "search" | "stop" | "open";
/** Menu accelerators (⌘N, ⇧⌘N, ⇧⌘I, ⌘L, ⌘F, ⌘.) arrive here; screens subscribe to `inborn:shortcut` on `window`. */
export function onDesktopShortcut(handler: (id: DesktopShortcut) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<DesktopShortcut>).detail);
  window.addEventListener("inborn:shortcut", listener);
  return () => window.removeEventListener("inborn:shortcut", listener);
}

function focusComposer(): void {
  const el = document.querySelector<HTMLElement>("textarea, input[type='text'], input:not([type])");
  el?.focus();
}

let vaultModel: ModelFile | null = null;
let eventsInstalled = false;

function installDesktopEvents(): void {
  if (eventsInstalled) return;
  eventsInstalled = true;
  const { listen } = tauri().event;
  void listen<DesktopShortcut>("inborn:shortcut", ({ payload }) => {
    if (payload === "focus-composer") focusComposer();
    window.dispatchEvent(new CustomEvent("inborn:shortcut", { detail: payload }));
  });
  void listen<ModelFile | null>("inborn:models-changed", ({ payload }) => {
    window.dispatchEvent(new CustomEvent("inborn:models-changed", { detail: payload }));
    // The engine is chosen once per run (engine.ts); a first import becomes usable by reloading the page.
    if (!vaultModel && payload) window.location.reload();
  });
  for (const name of ["inborn:import-failed", "inborn:documents-dropped", "inborn:seal", "inborn:update"]) {
    void listen<unknown>(name, ({ payload }) => {
      if (name === "inborn:import-failed") console.warn("[tauri] import failed:", payload);
      window.dispatchEvent(new CustomEvent(name, { detail: payload }));
    });
  }
}

/** Boot: find the vault's model (the catalog's `instant` first) and wire the shell events. */
export async function prepareTauri(): Promise<void> {
  installDesktopEvents();
  try {
    const files = await listModels();
    vaultModel = files.find((f) => f.id === "instant") ?? files[0] ?? null;
  } catch (e: unknown) {
    console.warn("[tauri] vault unavailable", e);
    vaultModel = null;
  }
}

export function tauriEngine(): Engine | null {
  if (!isTauri() || !vaultModel) return null;
  return { engine: new TauriLM(), model: { id: vaultModel.id, uri: vaultModel.path } };
}

export async function openTauriRepository(): Promise<ChatRepository> {
  return TauriChatRepository.open();
}

export function writeDevResult(result: Record<string, unknown>): void {
  invoke<string>("dev_write_result", { result }).then(
    (path) => console.info(`[tauri] dev-run written to ${path}`),
    (e: unknown) => console.warn("[tauri] dev-run write failed", e),
  );
}
