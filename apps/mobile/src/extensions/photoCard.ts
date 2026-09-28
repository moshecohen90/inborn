import type { PhotoPath, PhotoPlan } from "@inborn/core";
import { extensionPercent, type ExtensionState } from "./state";

type Msg = { key: string; params?: Record<string, unknown> };
export type HeldPhoto = Exclude<PhotoPlan, { kind: "send" }>;
export type PhotoRoute = "own" | "alt";

export interface PhotoHoldView {
  title: Msg;
  body: Msg;
  cost: Msg | null;
  error: string | null;
  primary: { action: "download" | "switch" | "resume" | "retry" | "vault"; label: Msg } | null;
  secondary: Msg | null;
  keepOpen: boolean;
  cancel: Msg;
}

export const seerOf = (plan: PhotoPlan): string | null => (plan.kind === "switch" ? plan.alt.model : null);

export const activePath = (held: HeldPhoto, route: PhotoRoute): PhotoPath | null => (held.kind === "none" ? null : held.kind === "switch" || route === "alt" ? held.alt : held.path);

export function pathCost(path: PhotoPath, seer: string, size: (bytes: number) => string): Msg {
  const model = path.missing.find((p) => p.kind === "model");
  const pack = path.missing.find((p) => p.kind === "pack");
  if (model && pack) return { key: "chat.vision.costBoth", params: { seer, modelSize: size(model.bytes), packSize: size(pack.bytes), total: size(path.bytes) } };
  if (model) return { key: "chat.vision.costModel", params: { seer, modelSize: size(model.bytes) } };
  if (pack) return { key: "chat.vision.costPack", params: { seer, packSize: size(pack.bytes) } };
  return { key: "chat.vision.costReady", params: { seer } };
}

export function photoHoldView(held: HeldPhoto, route: PhotoRoute, state: ExtensionState | null, { count, model, seer, size }: { count: number; model: string; seer: string; size: (bytes: number) => string }): PhotoHoldView {
  const cancel = { key: "extensions.vision.cancel", params: { count } };
  const base = { cost: null, error: null, primary: null, secondary: null, keepOpen: false, cancel };
  if (held.kind === "none") return { ...base, title: { key: "chat.vision.holdTitleModel", params: { model } }, body: { key: "chat.attach.noVisionHere", params: { model } } };
  const path = activePath(held, route)!;
  const onAlt = held.kind === "switch" || route === "alt";
  const title = held.kind === "switch" ? { key: "chat.vision.holdTitleModel", params: { model } } : onAlt ? { key: "chat.vision.altTitle", params: { seer } } : { key: "chat.vision.packTitle", params: { model } };
  const pct = { pct: state ? extensionPercent(state) : 0 };
  const running = onAlt ? { key: "chat.vision.downloadingSeer", params: { seer, ...pct } } : { key: "extensions.vision.downloading", params: pct };
  const s = state ?? { kind: "missing" as const, bytes: path.bytes };
  switch (s.kind) {
    case "downloading":
      return { ...base, title, keepOpen: !!s.keepOpen, body: running };
    case "ready":
      return { ...base, title, body: { ...running, params: { ...running.params, pct: 100 } } };
    case "paused":
      return { ...base, title, body: running, primary: { action: "resume", label: { key: "chat.vision.download", params: { size: size(path.bytes - s.bytes) } } } };
    case "stuck":
      return { ...base, title, body: { key: "extensions.stuck" }, primary: { action: "vault", label: { key: "voice.openVault" } } };
    case "unavailable":
      return { ...base, title, body: { key: "extensions.vision.unavailable", params: { count } }, secondary: held.kind === "pack" && !onAlt && held.alt ? { key: "chat.vision.useSeer", params: { seer } } : null, cost: held.kind === "pack" && !onAlt && held.alt ? pathCost(held.alt, seer, size) : null };
    default:
      break;
  }
  const error = s.kind === "failed" ? s.error : null;
  if (onAlt) {
    const ready = path.missing.length === 0;
    return {
      ...base,
      title,
      error,
      body: { key: ready ? "chat.vision.switchReady" : "chat.vision.switchBody", params: { seer, count } },
      cost: ready ? null : pathCost(path, seer, size),
      primary: error ? { action: "retry", label: { key: "extensions.retry" } } : { action: "switch", label: ready ? { key: "chat.vision.switchTo", params: { seer } } : { key: "chat.vision.switchToCost", params: { seer, size: size(path.bytes) } } },
    };
  }
  const alt = held.kind === "pack" ? held.alt : null;
  return {
    ...base,
    title,
    error,
    body: { key: "extensions.vision.why", params: { count, size: size(path.bytes) } },
    primary: error ? { action: "retry", label: { key: "extensions.retry" } } : { action: "download", label: { key: "chat.vision.download", params: { size: size(path.bytes) } } },
    secondary: alt ? { key: "chat.vision.useSeer", params: { seer } } : null,
    cost: alt ? pathCost(alt, seer, size) : null,
  };
}
