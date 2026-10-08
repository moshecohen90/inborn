import { BUNDLED_MANIFEST, findModel, formatModelBytes, type PhotoPath, type PhotoPlan } from "@inborn/core";
import { extensionPercent, type ExtensionState } from "./state";

type Msg = { key: string; params?: Record<string, unknown> };
export type HeldPhoto = Exclude<PhotoPlan, { kind: "send" }>;
export type PhotoRoute = "own" | "alt";

export interface PhotoHoldView {
  title: Msg;
  body: Msg;
  progress: number | null;
  error: string | null;
  primary: { action: "download" | "switch" | "resume" | "retry" | "vault"; label: Msg } | null;
  secondary: Msg | null;
  caption: Msg | null;
  keepOpen: boolean;
  cancel: Msg;
  /** No connection: the card says so and that the download starts by itself. */
  offline: boolean;
}

export const seerOf = (plan: PhotoPlan): string | null => (plan.kind === "switch" ? plan.alt.model : null);

export const activePath = (held: HeldPhoto, route: PhotoRoute): PhotoPath | null => (held.kind === "none" ? null : held.kind === "switch" || route === "alt" ? held.alt : held.path);

const modelBytes = (id: string): number => findModel(BUNDLED_MANIFEST, id)?.bytes ?? 0;

/** The part in the whole's unit, so the line reads "53 of 668 MB". */
export function partOf(have: number, total: number): { have: string; total: string } {
  const unit = total >= 1e9 ? 1e9 : total >= 1e6 ? 1e6 : total >= 1e3 ? 1e3 : 1;
  const digits = total >= 1e9 && total < 10e9 ? 2 : 0;
  return { have: (Math.min(Math.max(have, 0), total) / unit).toFixed(digits), total: formatModelBytes(total) };
}

export function switchLabel(path: PhotoPath, seer: string, size: (bytes: number) => string): Msg {
  return path.missing.length ? { key: "chat.vision.switchToCost", params: { seer, size: size(path.bytes) } } : { key: "chat.vision.switchTo", params: { seer } };
}

function switchBody(path: PhotoPath, seer: string, count: number, size: (bytes: number) => string): Msg {
  const model = path.missing.find((p) => p.kind === "model");
  const pack = path.missing.find((p) => p.kind === "pack");
  if (model && pack) return { key: "chat.vision.switchBody", params: { seer, count, modelSize: size(model.bytes), packSize: size(pack.bytes) } };
  if (model) return { key: "chat.vision.switchBodyModel", params: { seer, count, modelSize: size(model.bytes) } };
  if (pack) return { key: "chat.vision.switchBodyPack", params: { seer, count, packSize: size(pack.bytes) } };
  return { key: "chat.vision.switchReady", params: { seer, count } };
}

export function photoHoldView(
  held: HeldPhoto,
  route: PhotoRoute,
  state: ExtensionState | null,
  { count, model, seer, size, storeReachable = true }: { count: number; model: string; seer: string; size: (bytes: number) => string; storeReachable?: boolean },
): PhotoHoldView {
  const cancel = { key: "extensions.vision.cancel", params: { count } };
  const base = { progress: null, error: null, primary: null, secondary: null, caption: null, keepOpen: false, cancel, offline: false };
  if (held.kind === "none") return { ...base, title: { key: "chat.vision.holdTitleModel", params: { model } }, body: { key: "chat.attach.noVisionHere", params: { model } } };
  const path = activePath(held, route)!;
  const onAlt = held.kind === "switch" || route === "alt";
  const title = held.kind === "switch" ? { key: "chat.vision.holdTitleModel", params: { model } } : onAlt ? { key: "chat.vision.altTitle", params: { seer } } : { key: "chat.vision.packTitle", params: { model } };
  const alt = held.kind === "pack" && !onAlt ? held.alt : null;
  const selected = held.kind === "pack" ? held.path.model : "";
  /* A smaller model is a cheaper way out, not a better one, so the card says what it costs in accuracy. */
  const wayOut = alt ? { secondary: switchLabel(alt, seer, size), caption: modelBytes(alt.model) < modelBytes(selected) ? { key: "chat.vision.smaller" } : null } : {};
  const running = (have: number): Msg => (onAlt ? { key: "chat.vision.downloadingSeer", params: { seer, ...partOf(have, path.bytes) } } : { key: "chat.vision.downloadingPack", params: partOf(have, path.bytes) });
  const retry = { action: "retry" as const, label: { key: "extensions.retry" } };
  const s = state ?? { kind: "missing" as const, bytes: path.bytes };
  /* Nothing can bring this file here, so Try again would fail the same way: the way out becomes the button, and Play is named only when Play itself is absent. */
  if (s.kind === "failed" && s.error === "no-delivery") {
    const blocked = { ...base, title: { key: "chat.vision.holdTitleModel", params: { model } }, error: storeReachable ? null : s.error };
    if (!alt) return { ...blocked, body: { key: "chat.attach.noVisionHere", params: { model } } };
    return { ...blocked, body: { key: "chat.vision.packNotHere", params: { seer, model } }, primary: { action: "switch", label: switchLabel(alt, seer, size) } };
  }
  switch (s.kind) {
    case "downloading":
      return { ...base, title, keepOpen: !!s.keepOpen, body: running(s.bytes), progress: extensionPercent(s) / 100 };
    case "ready":
      return { ...base, title, body: running(path.bytes), progress: 1 };
    case "paused":
      return { ...base, title, body: running(s.bytes), progress: extensionPercent(s) / 100, primary: { action: "resume", label: { key: "chat.vision.download", params: { size: size(path.bytes - s.bytes) } } } };
    case "offline":
      return { ...base, ...wayOut, title, offline: true, body: { key: "vault.state.waitingNetwork" }, progress: extensionPercent(s) / 100 };
    case "stuck":
      return { ...base, title, body: { key: "extensions.stuck" }, primary: { action: "vault", label: { key: "voice.openVault" } } };
    case "unavailable":
      return { ...base, ...wayOut, title, body: { key: "extensions.vision.unavailable", params: { count } } };
    default:
      break;
  }
  const error = s.kind === "failed" ? s.error : null;
  if (onAlt) return { ...base, title, error, body: switchBody(path, seer, count, size), primary: error ? retry : { action: "switch", label: switchLabel(path, seer, size) } };
  return {
    ...base,
    ...wayOut,
    title,
    error,
    body: { key: "chat.vision.packBody", params: { count, size: size(path.bytes) } },
    primary: error ? retry : { action: "download", label: { key: "chat.vision.download", params: { size: size(path.bytes) } } },
  };
}
