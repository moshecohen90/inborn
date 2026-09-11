import type { ModelRef, ModelTier, Tier } from "@inborn/core";
import { getVault } from "./store";

/** The installed catalog chat model of a tier, for the device guard's switches (§6.5); null when none is on the device. */
export function resolveTier(tier: Tier): ModelRef | null {
  const vault = getVault();
  for (const e of vault.entries()) {
    if (e.model.role !== "chat" || e.model.tier !== tier) continue;
    const loc = vault.locate(e.model.id);
    if (loc) return { id: e.model.id, uri: loc.path };
  }
  return null;
}

/** Tiers the guard may switch to right now (the policy proposes nothing towards a tier that is not installed). */
export function installedTiers(): ModelTier[] {
  const vault = getVault();
  const out = new Set<ModelTier>();
  for (const e of vault.entries()) if (e.model.role === "chat" && e.model.tier && vault.locate(e.model.id)) out.add(e.model.tier);
  return [...out];
}
