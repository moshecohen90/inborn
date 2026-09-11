import { ramNeedGB } from "../catalog/huggingface";
import type { ModelTier } from "./types";

/** What the boot-time floor needs to know about a chat model: catalog models carry their minimum, imports derive it from size. */
export interface BootCandidate {
  id: string;
  tier: ModelTier | null;
  bytes: number;
  minRamGB?: number;
}

export interface BootDecision {
  id: string;
  /** Instant starts instead of the default; the §8.8 memory line explains and offers the way back. */
  switched: boolean;
  from: ModelTier | null;
}

/* Imports record 0 for the minimum (the vault has no catalog row for them); the size rule the Hugging Face search applies stands in. */
export const bootMinRamGB = (m: BootCandidate): number => (m.minRamGB && m.minRamGB > 0 ? m.minRamGB : ramNeedGB(m.bytes).min);

/**
 * Boot-time RAM floor (§6.5): a default model whose minimum RAM the device cannot meet is never mapped first only to be
 * evicted seconds later; Instant starts in its place when it is installed and needs less. Unknown RAM keeps the default.
 */
export function bootModel(defaultModel: BootCandidate, ramGB: number | null, instant: BootCandidate | null): BootDecision {
  const keep: BootDecision = { id: defaultModel.id, switched: false, from: null };
  if (ramGB === null || !Number.isFinite(ramGB) || ramGB >= bootMinRamGB(defaultModel)) return keep;
  if (!instant || instant.id === defaultModel.id || bootMinRamGB(instant) >= bootMinRamGB(defaultModel)) return keep;
  return { id: instant.id, switched: true, from: defaultModel.tier };
}
