import type { ModelRef, ModelTier, Tier } from "@inborn/core";

/* Web: one model, no vault-driven tier switches (the native file reads the vault; this one keeps llama.rn out of the web bundle). */
export const resolveTier = (_tier: Tier): ModelRef | null => null;
export const installedTiers = (): ModelTier[] => [];
