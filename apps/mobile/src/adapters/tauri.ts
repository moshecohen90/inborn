/* Desktop (Tauri v2): the same LocalLM and ChatRepository contracts, served by the Rust side over Tauri's IPC.
   IPC is not a socket (`ipc:` / `http://ipc.localhost` are in-process schemes); the webview still has no network. */
import {
  SEARCH_LIMIT,
  matchesTerms,
  newId,
  searchExclusions,
  searchTerms,
  snippetAround,
  ANSWER_CEILING,
  type Capabilities,
  type Chat,
  type ChatMessage,
  type Citation,
  type ChatPatch,
  type ChatRepository,
  type Delta,
  type Embedder,
  type GenOpts,
  type LoadOptions,
  type LocalLM,
  type Message,
  type MessagePatch,
  type ModelRef,
  type NewChat,
  type NewMessage,
  type SearchHit,
  type SearchOptions,
  type Session,
  type Stats,
  type StoppedBy,
  type Usage,
} from "@inborn/core";
import { FTS_SQL, MIGRATIONS, PRAGMAS_SQL, SQL, ftsQuery, inList } from "../storage/schema";
import { emitShortcut, type Shortcut } from "../lib/shortcuts";
import type { Engine } from "./index";
import { reportRepair } from "../storage/repairNotice";

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
      opts: { maxTokens: opts.maxTokens ?? ANSWER_CEILING, temperature: opts.temperature ?? 0.7, topP: opts.topP ?? 0.9, stop: opts.stop, reasoning: opts.reasoning ?? true },
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

type ChatRow = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  model_id: string;
  persona_id: string | null;
  pinned: number;
  folder_id: string | null;
  archived: number;
  system_prompt: string | null;
  thinking: number | null;
  summary: string | null;
  summary_up_to: string | null;
  advice_snoozed: string | null;
};
type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessage["role"];
  content: string;
  reasoning: string | null;
  reasoning_ms: number | null;
  model_id: string | null;
  created_at: number;
  stopped: number;
  stopped_by: StoppedBy | null;
  usage_json: string | null;
  citations_json: string | null;
  images_json: string | null;
};
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
  ...(r.archived ? { archived: true } : {}),
  ...(r.folder_id ? { folderId: r.folder_id } : {}),
  ...(r.system_prompt ? { systemPrompt: r.system_prompt } : {}),
  ...(r.thinking !== null && r.thinking !== undefined ? { thinking: !!r.thinking } : {}),
  ...(r.summary ? { summary: r.summary } : {}),
  ...(r.summary_up_to ? { summaryUpTo: r.summary_up_to } : {}),
  ...(r.advice_snoozed ? { adviceSnoozed: JSON.parse(r.advice_snoozed) as string[] } : {}),
});

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
  ...(r.reasoning !== null ? { reasoning: r.reasoning } : {}),
  ...(r.reasoning_ms !== null ? { reasoningMs: r.reasoning_ms } : {}),
  ...(r.model_id ? { modelId: r.model_id } : {}),
  ...(r.stopped ? { stopped: true } : {}),
  ...(r.stopped_by ? { stoppedBy: r.stopped_by } : {}),
  ...(r.usage_json ? { usage: JSON.parse(r.usage_json) as Usage } : {}),
  ...(r.citations_json ? { citations: JSON.parse(r.citations_json) as Citation[] } : {}),
  ...(r.images_json ? { images: JSON.parse(r.images_json) as string[] } : {}),
});

const all = <T extends Row>(sql: string, params: SqlValue[] = []): Promise<T[]> => invoke<T[]>("db_all", { sql, params });
const run = (sql: string, params: SqlValue[] = []): Promise<number> => invoke<number>("db_run", { sql, params });
const exec = (sql: string): Promise<void> => invoke("db_exec", { sql });
const batch = (statements: { sql: string; params: SqlValue[] }[]): Promise<number[]> => invoke<number[]>("db_batch", { statements });

/** Same steps as the phones' `migrate()`: each pending migration runs in one transaction that ends by stamping user_version. */
export async function migrateDesktop(): Promise<number> {
  await exec(PRAGMAS_SQL);
  let current = Number((await all<{ user_version: number }>("PRAGMA user_version"))[0]?.user_version ?? 0);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    try {
      await exec(`BEGIN;\n${m.sql}\nPRAGMA user_version = ${m.version};\nCOMMIT;`);
    } catch (e) {
      await exec("ROLLBACK;").catch(() => undefined);
      throw e;
    }
    current = m.version;
  }
  return current;
}

/** SQLCipher on the Rust side (same schema and SQL as the phones); the key lives in the OS keychain. Refuses incognito rows. */
export class TauriChatRepository implements ChatRepository {
  private constructor(
    readonly fts: boolean,
    readonly schemaVersion: number,
  ) {}

  static async open(): Promise<TauriChatRepository> {
    const opened = await invoke<{ kind: string; fts: boolean; quarantined?: string }>("db_open");
    // The desktop carried the same silent delete the phones had (F58); now it keeps the file and the strip says so.
    if (opened.quarantined) reportRepair({ kind: "started-fresh", copied: 0, lost: 0, quarantined: opened.quarantined });
    const version = await migrateDesktop();
    let fts = true;
    try {
      await exec(FTS_SQL);
    } catch {
      fts = false;
    }
    return new TauriChatRepository(fts, version);
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
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    };
    await run(SQL.insertChat, [
      chat.id,
      chat.title,
      now,
      now,
      chat.modelId,
      input.personaId ?? null,
      input.pinned ? 1 : 0,
      input.folderId ?? null,
      input.systemPrompt ?? null,
      input.thinking === undefined ? null : input.thinking ? 1 : 0,
    ]);
    return chat;
  }

  async renameChat(id: string, title: string): Promise<void> {
    await run(SQL.renameChat, [title.trim(), id]);
  }

  async updateChat(id: string, patch: ChatPatch): Promise<void> {
    const columns: [string, SqlValue][] = [];
    if (patch.title !== undefined) columns.push(["title", patch.title.trim()]);
    if (patch.pinned !== undefined) columns.push(["pinned", patch.pinned ? 1 : 0]);
    if (patch.archived !== undefined) columns.push(["archived", patch.archived ? 1 : 0]);
    if (patch.modelId !== undefined) columns.push(["model_id", patch.modelId]);
    if (patch.thinking !== undefined) columns.push(["thinking", patch.thinking ? 1 : 0]);
    if (patch.folderId !== undefined) columns.push(["folder_id", patch.folderId]);
    if (patch.personaId !== undefined) columns.push(["persona_id", patch.personaId]);
    if (patch.systemPrompt !== undefined) columns.push(["system_prompt", patch.systemPrompt]);
    if (patch.summary !== undefined) columns.push(["summary", patch.summary]);
    if (patch.summaryUpTo !== undefined) columns.push(["summary_up_to", patch.summaryUpTo]);
    if (patch.adviceSnoozed !== undefined) columns.push(["advice_snoozed", patch.adviceSnoozed?.length ? JSON.stringify(patch.adviceSnoozed) : null]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    await run(`UPDATE chats SET ${sets} WHERE id = ?`, [...columns.map(([, v]) => v), id]);
  }

  async deleteChat(id: string): Promise<void> {
    await this.deleteChats([id]);
  }

  async deleteChats(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await batch([
      { sql: `DELETE FROM messages WHERE chat_id IN (${inList(ids.length)})`, params: ids },
      { sql: `DELETE FROM chats WHERE id IN (${inList(ids.length)})`, params: ids },
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
      ...(input.reasoningMs !== undefined ? { reasoningMs: input.reasoningMs } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.stopped ? { stopped: true } : {}),
      ...(input.stoppedBy ? { stoppedBy: input.stoppedBy } : {}),
      ...(input.usage ? { usage: { ...input.usage } } : {}),
      ...(input.citations?.length ? { citations: input.citations.map((c) => ({ ...c })) } : {}),
      ...(input.images?.length ? { images: [...input.images] } : {}),
      ...(input.safety ? { safety: input.safety } : {}),
    };
    // The touch goes first: zero changed rows means no such chat, and the batch's transaction never inserts an orphan.
    const [touched] = await batch([
      { sql: SQL.touchChat, params: [now, input.chatId] },
      {
        sql: SQL.insertMessage,
        params: [message.id, message.chatId, message.role, message.content, input.reasoning ?? null, input.reasoningMs ?? null, input.modelId ?? null, now, input.stopped ? 1 : 0, input.stoppedBy ?? null, input.usage ? JSON.stringify(input.usage) : null, message.citations ? JSON.stringify(message.citations) : null, message.images ? JSON.stringify(message.images) : null],
      },
    ]).catch((e: unknown) => {
      throw new Error(/FOREIGN KEY/i.test(String(e)) ? `unknown chat ${input.chatId}` : String(e));
    });
    if (touched === 0) {
      await run(SQL.deleteMessagesOfChat, [input.chatId]);
      throw new Error(`unknown chat ${input.chatId}`);
    }
    return message;
  }

  async updateMessage(chatId: string, messageId: string, patch: MessagePatch): Promise<void> {
    const columns: [string, SqlValue][] = [];
    if (patch.content !== undefined) columns.push(["content", patch.content]);
    if (patch.reasoning !== undefined) columns.push(["reasoning", patch.reasoning]);
    if (patch.reasoningMs !== undefined) columns.push(["reasoning_ms", patch.reasoningMs]);
    if (patch.stopped !== undefined) columns.push(["stopped", patch.stopped ? 1 : 0]);
    if (patch.stoppedBy !== undefined) columns.push(["stopped_by", patch.stoppedBy]);
    if (patch.usage !== undefined) columns.push(["usage_json", JSON.stringify(patch.usage)]);
    if (patch.citations !== undefined) columns.push(["citations_json", patch.citations.length ? JSON.stringify(patch.citations) : null]);
    if (patch.images !== undefined) columns.push(["images_json", patch.images.length ? JSON.stringify(patch.images) : null]);
    if (!columns.length) return;
    const sets = columns.map(([name]) => `${name} = ?`).join(", ");
    const changed = await run(`UPDATE messages SET ${sets} WHERE id = ? AND chat_id = ?`, [...columns.map(([, v]) => v), messageId, chatId]);
    if (changed === 0) throw new Error(`unknown message ${messageId} in chat ${chatId}`);
  }

  async deleteMessagesFrom(chatId: string, messageId: string): Promise<number> {
    const row = (await all<{ seq: number }>(SQL.messageSeq, [messageId, chatId]))[0];
    if (!row) return 0;
    const [removed] = await batch([
      { sql: SQL.deleteMessagesFromSeq, params: [chatId, row.seq] },
      // Same rule as SqliteChatRepository: a summary whose anchor message is gone is dropped with it.
      { sql: "UPDATE chats SET summary = NULL, summary_up_to = NULL WHERE id = ? AND summary_up_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages WHERE chat_id = chats.id AND id = chats.summary_up_to)", params: [chatId] },
    ]);
    return removed ?? 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchHit[]> {
    const terms = searchTerms(query);
    const first = terms[0];
    if (!first) return [];
    const chats = await this.listChats();
    const excluded = searchExclusions(chats, options?.hiddenFolderIds);
    const titles = new Map(chats.map((c) => [c.id, c.title]));
    const hits: SearchHit[] = chats.filter((c) => !excluded.has(c.id) && matchesTerms(c.title, terms)).map((c) => ({ chatId: c.id, title: c.title, snippet: c.title }));
    const rows = this.fts
      ? await all<SearchRow>(SQL.searchFts, [ftsQuery(terms), SEARCH_LIMIT + excluded.size])
      : (await all<SearchRow>(SQL.searchLike, [`%${first}%`, SEARCH_LIMIT * 4])).filter((r) => matchesTerms(r.content, terms));
    for (const r of rows) if (!excluded.has(r.chat_id)) hits.push({ chatId: r.chat_id, title: titles.get(r.chat_id) ?? "", messageId: r.id, snippet: snippetAround(r.content, terms) });
    return hits.slice(0, SEARCH_LIMIT);
  }
}

/** Embeddings from the Rust engine (`lm_embed`): the companion model loads on first call and stays until `lm_unload`. */
export class TauriEmbedder implements Embedder {
  constructor(
    readonly id: string,
    private readonly path: string,
  ) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    const rows = await invoke<number[][]>("lm_embed", { request: { path: this.path, texts } });
    return rows.map((r) => Float32Array.from(r));
  }

  async unload(): Promise<void> {}
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

export type DesktopShortcut = Shortcut;
/** Menu accelerators (⌘N, ⇧⌘N, ⇧⌘I, ⌘L, ⌘F, ⌘.) arrive here and on the `lib/shortcuts` bus (`useShortcut`) the screens subscribe to. */
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
    emitShortcut(payload);
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
