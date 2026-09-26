import type { Extension } from "@inborn/core";
import { extensionPercent, type ExtensionState } from "./state";

/** Every string an extension needs lives in one locale block, `extensions.<id>.*`; the rest is shared. */
export const extKey = (ext: Pick<Extension, "id">, leaf: "name" | "why" | "downloading" | "unavailable" | "cancel" | "fallback" | "vault" | "timeHint"): string => `extensions.${ext.id}.${leaf}`;

/* testIDs the device and headless drivers of rounds 75–103 already click; a new extension gets `ext-hold-<id>`. */
const LEGACY_IDS: Record<string, { prefix: string; cancel?: string; fallback?: string }> = {
  "embed-e5": { prefix: "docs-hold", fallback: "docs-hold-words" },
  "vision-qwen35": { prefix: "vision-hold", cancel: "vision-hold-remove" },
};

export function holdTestIds(ext: Pick<Extension, "id">) {
  const legacy = LEGACY_IDS[ext.id];
  const prefix = legacy?.prefix ?? `ext-hold-${ext.id}`;
  return {
    card: prefix,
    body: `${prefix}-body`,
    error: `${prefix}-error`,
    download: `${prefix}-download`,
    resume: `${prefix}-resume`,
    vault: `${prefix}-vault`,
    keepOpen: `${prefix}-keep-open`,
    time: `${prefix}-time`,
    fallback: legacy?.fallback ?? `${prefix}-fallback`,
    cancel: legacy?.cancel ?? `${prefix}-cancel`,
  };
}

type Msg = { key: string; params?: Record<string, unknown> };

export interface HoldView {
  body: Msg;
  /** The raw error, for the F349 plain sentence; never shown as is. */
  error: string | null;
  /** Download or Try again; null while it runs, when ready, or when nothing here can fetch it. */
  download: Msg | null;
  resume: boolean;
  openVault: boolean;
  keepOpen: boolean;
  fallback: Msg | null;
  cancel: Msg;
}

/**
 * The one hold card, as data (round 105): what it says and offers for this extension in this state. `size` is the
 * formatted byte count; `count` the attachments held.
 */
export function holdView(ext: Extension, state: ExtensionState, { count, size }: { count: number; size: string }): HoldView {
  const fallback = ext.fallback ? { key: extKey(ext, "fallback") } : null;
  const cancel = { key: extKey(ext, "cancel"), params: { count } };
  const base = { error: null, download: null, resume: false, openVault: false, keepOpen: false, fallback, cancel };
  switch (state.kind) {
    case "downloading":
      return { ...base, keepOpen: !!state.keepOpen, body: { key: extKey(ext, "downloading"), params: { pct: extensionPercent(state) } } };
    case "paused":
      return { ...base, resume: true, body: { key: extKey(ext, "downloading"), params: { pct: extensionPercent(state) } } };
    case "stuck":
      return { ...base, openVault: true, body: { key: "extensions.stuck" } };
    case "unavailable":
      return { ...base, body: { key: extKey(ext, "unavailable"), params: { count } } };
    case "ready":
      return { ...base, body: { key: extKey(ext, "downloading"), params: { pct: 100 } } };
    case "failed":
      return { ...base, error: state.error, download: { key: "extensions.retry" }, body: { key: extKey(ext, "why"), params: { count, size } } };
    default:
      return { ...base, download: { key: "extensions.download", params: { size } }, body: { key: extKey(ext, "why"), params: { count, size } } };
  }
}

/** The vault row's state line. */
export function vaultRowState(state: ExtensionState, size: string): Msg {
  switch (state.kind) {
    case "ready":
      return { key: state.bundled ? "extensions.state.included" : "extensions.state.installed", params: { size } };
    case "downloading":
    case "paused":
      return { key: "extensions.state.downloading", params: { pct: extensionPercent(state), size } };
    case "failed":
      return { key: "extensions.state.failed", params: { size } };
    case "unavailable":
      return { key: "extensions.state.unavailable", params: { size } };
    case "stuck":
      return { key: "extensions.stuck" };
    default:
      return { key: "extensions.state.missing", params: { size } };
  }
}
