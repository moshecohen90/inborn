import type { Role, Usage } from "../llm/types";
import type { Citation } from "../rag/types";

/** Who ended a generation early: the user tapped Stop, or the system (memory, heat, background) cut it (§8.8, §10.3). */
export type StoppedBy = "user" | "system";

/** A conversation (spec §5.3). `incognito` chats live in RAM only and never reach a persistent repository (§5.7). */
export interface Chat {
  id: string;
  title: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  modelId: string;
  personaId?: string;
  incognito: boolean;
  pinned?: boolean;
  archived?: boolean;
  folderId?: string;
  /** Per-chat system prompt (§7.6); layered under the persona's prompt. */
  systemPrompt?: string;
  /** Reasoning on/off for models that support it; always off for Instant. */
  thinking?: boolean;
  /** "Summarize and continue" (§8.2 S11): the summary replaces every message up to and including `summaryUpTo`. */
  summary?: string;
  summaryUpTo?: string;
}

/** One stored turn. Distinct from the engine's wire `Message` (role + content only). */
export interface ChatMessage {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  reasoning?: string;
  /** Wall-clock milliseconds the model spent in its reasoning block. */
  reasoningMs?: number;
  modelId?: string;
  createdAt: number;
  /** True when the user (or the system) stopped generation before the model finished. */
  stopped?: boolean;
  stoppedBy?: StoppedBy;
  usage?: Usage;
  /** Passages the model saw for this answer (§7.3); the chips shown are derived from the [n] marks in `content`. */
  citations?: Citation[];
}

export interface NewChat {
  modelId: string;
  title?: string;
  personaId?: string;
  incognito?: boolean;
  pinned?: boolean;
  folderId?: string;
  systemPrompt?: string;
  thinking?: boolean;
}

export interface NewMessage {
  chatId: string;
  role: Role;
  content: string;
  reasoning?: string;
  reasoningMs?: number;
  modelId?: string;
  stopped?: boolean;
  stoppedBy?: StoppedBy;
  usage?: Usage;
  citations?: Citation[];
}

export type MessagePatch = Partial<Pick<ChatMessage, "content" | "reasoning" | "reasoningMs" | "stopped" | "stoppedBy" | "usage" | "citations">>;

/** `null` clears an optional field (folder, persona, summary…); `undefined` leaves it alone. */
export type ChatPatch = {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  folderId?: string | null;
  personaId?: string | null;
  modelId?: string;
  systemPrompt?: string | null;
  thinking?: boolean;
  summary?: string | null;
  summaryUpTo?: string | null;
};

export interface SearchHit {
  chatId: string;
  title: string;
  /** Undefined when the hit is on the chat title itself. */
  messageId?: string;
  snippet: string;
}

/** Folders group chats (§8.3 S20). Pro-gated in the UI; the storage does not care. */
export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

/** Icon ids come from a fixed glyph library (§8.5 S41: "SVG library, not emoji"). */
export type PersonaIcon = "spark" | "pen" | "book" | "globe" | "code" | "scale" | "heart" | "briefcase" | "flask" | "compass";

export interface Persona {
  id: string;
  name: string;
  icon: PersonaIcon;
  systemPrompt: string;
  defaultModelId?: string;
  /** 0–2; undefined = engine default. */
  temperature?: number;
  /** Shown as a fixed line under the persona's name (§10.5 #37: medical / legal / money). */
  disclaimer?: string;
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PersonaInput = Pick<Persona, "name" | "icon" | "systemPrompt"> & Partial<Pick<Persona, "id" | "defaultModelId" | "temperature" | "disclaimer">>;

/** One "fact about me" (§8.5 S42). `personaId` undefined = applies to every persona. */
export interface MemoryFact {
  id: string;
  content: string;
  /** The chat it was learned from, when it came from a chat and that chat still exists. */
  sourceChatId?: string;
  personaId?: string;
  enabled: boolean;
  createdAt: number;
}

export type MemoryFactInput = Pick<MemoryFact, "content"> & Partial<Pick<MemoryFact, "sourceChatId" | "personaId" | "enabled">>;
export type MemoryFactPatch = Partial<Pick<MemoryFact, "content" | "personaId" | "enabled">>;

export type ReportReason = "offensive" | "dangerous" | "wrong" | "other";

/** A report about a model answer, stored on the device only (§8.2 S13); the user chooses if and when to send it. */
export interface Report {
  id: string;
  reason: ReportReason;
  note: string;
  chatId?: string;
  messageId?: string;
  /** Present only when the user ticked "include the message". */
  messageText?: string;
  modelId?: string;
  createdAt: number;
}

export type ReportInput = Omit<Report, "id" | "createdAt">;
