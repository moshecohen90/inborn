import type { Chat, ChatMessage } from "./types";

export type ExportFormat = "markdown" | "json" | "text";

export interface ExportFile {
  filename: string;
  mimeType: string;
  body: string;
}

export interface ExportOptions {
  /** Friendly model names by id (falls back to the id upper-cased). */
  modelNames?: Record<string, string>;
  /** Include reasoning blocks when present. */
  reasoning?: boolean;
  now?: number;
  appName?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function stamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Safe file stem: letters/digits of any script, spaces → dashes, capped. */
export function safeFilename(title: string, fallback = "chat"): string {
  const stem = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return stem || fallback;
}

const modelName = (id: string | undefined, o: ExportOptions) => (id ? (o.modelNames?.[id] ?? id.toUpperCase()) : "");

/** One chat as a file (§7.1: single-chat export is free). Incognito chats are never passed here by the UI. */
export function exportChat(chat: Chat, messages: readonly ChatMessage[], format: ExportFormat, options: ExportOptions = {}): ExportFile {
  const stem = safeFilename(chat.title);
  const turns = messages.filter((m) => m.role === "user" || m.role === "assistant");
  if (format === "json") {
    const body = {
      app: options.appName ?? "Inborn",
      exportedAt: new Date(options.now ?? Date.now()).toISOString(),
      chat: { id: chat.id, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt, modelId: chat.modelId, ...(chat.systemPrompt ? { systemPrompt: chat.systemPrompt } : {}) },
      messages: turns.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        ...(m.modelId ? { modelId: m.modelId } : {}),
        ...(options.reasoning && m.reasoning ? { reasoning: m.reasoning } : {}),
        ...(m.stopped ? { stopped: true } : {}),
        ...(m.usage ? { usage: m.usage } : {}),
      })),
    };
    return { filename: `${stem}.json`, mimeType: "application/json", body: JSON.stringify(body, null, 2) };
  }
  if (format === "text") {
    const lines = [chat.title || "Chat", stamp(chat.createdAt), ""];
    for (const m of turns) {
      lines.push(`${m.role === "user" ? "You" : modelName(m.modelId ?? chat.modelId, options) || "Assistant"} · ${stamp(m.createdAt)}`);
      lines.push(m.content.trim(), "");
    }
    return { filename: `${stem}.txt`, mimeType: "text/plain", body: lines.join("\n") };
  }
  const md = [`# ${chat.title || "Chat"}`, "", `_${stamp(chat.createdAt)} · ${modelName(chat.modelId, options)} · on-device_`, ""];
  if (chat.systemPrompt) md.push("> **System prompt:** " + chat.systemPrompt.replace(/\n/g, "\n> "), "");
  for (const m of turns) {
    md.push(`## ${m.role === "user" ? "You" : modelName(m.modelId ?? chat.modelId, options) || "Assistant"}`, "");
    if (options.reasoning && m.reasoning) md.push("<details><summary>Reasoning</summary>", "", m.reasoning.trim(), "", "</details>", "");
    md.push(m.content.trim(), "");
    if (m.stopped) md.push("_Stopped_", "");
  }
  return { filename: `${stem}.md`, mimeType: "text/markdown", body: md.join("\n") };
}
