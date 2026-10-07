import { visionPackFor } from "./extensions";
import type { CatalogModel } from "./types";

export interface PathPiece {
  id: string;
  kind: "model" | "pack";
  bytes: number;
}

export interface PhotoPath {
  model: string;
  pack: string;
  /** The chat model first, so an abandoned path never leaves a pack for a model that is not there. */
  missing: PathPiece[];
  bytes: number;
}

export type PhotoPlan =
  | { kind: "send"; path: PhotoPath }
  /** `alt` only when it costs less than `path`, or nothing. */
  | { kind: "pack"; path: PhotoPath; alt: PhotoPath | null }
  | { kind: "switch"; alt: PhotoPath }
  | { kind: "none" };

type SeeingModel = Pick<CatalogModel, "id" | "bytes" | "vision">;

export interface PhotoPlanInput {
  selected: string;
  /** In catalog order: equal costs keep it, so Instant wins a tie. */
  models: readonly SeeingModel[];
  installed: (id: string) => boolean;
  /** False for a file this host does not serve: a way out through it would fail after the tap. */
  available?: (id: string) => boolean;
}

export function photoPath(model: SeeingModel, installed: (id: string) => boolean): PhotoPath | null {
  const pack = model.vision ? visionPackFor(model.id) : undefined;
  if (!pack) return null;
  const missing: PathPiece[] = [];
  if (!installed(model.id)) missing.push({ id: model.id, kind: "model", bytes: model.bytes });
  if (!installed(pack.id)) missing.push({ id: pack.id, kind: "pack", bytes: pack.bytes });
  return { model: model.id, pack: pack.id, missing, bytes: missing.reduce((n, p) => n + p.bytes, 0) };
}

export function photoPlan({ selected, models, installed, available = () => true }: PhotoPlanInput): PhotoPlan {
  const offerable = (p: PhotoPath | null): p is PhotoPath => p !== null && p.missing.every((x) => available(x.id));
  const current = models.find((m) => m.id === selected);
  const own = current ? photoPath(current, installed) : null;
  if (own && own.missing.length === 0) return { kind: "send", path: own };
  const others = models
    .filter((m) => m.id !== selected)
    .map((m) => photoPath(m, installed))
    .filter(offerable)
    .sort((a, b) => a.bytes - b.bytes);
  const cheapest = others[0] ?? null;
  if (offerable(own)) return { kind: "pack", path: own, alt: cheapest && (cheapest.bytes === 0 || cheapest.bytes < own.bytes) ? cheapest : null };
  return cheapest ? { kind: "switch", alt: cheapest } : { kind: "none" };
}
