import { fileIntake, kindOf, type DocKind, type LicenceTier } from "@inborn/core";

/** One dropped path with its first bytes, so the kind is sniffed the same way a picked file is (§8.9, gap 30). */
export interface DroppedEntry {
  path: string;
  head: Uint8Array;
}

export interface DroppedFile {
  path: string;
  name: string;
  kind: DocKind;
}

export type DropRejection = "unsupported" | "work-only" | "over-free-limit";

export interface DropPlan {
  /** Files to import, in the order they were dropped. */
  accept: DroppedFile[];
  rejected: { name: string; reason: DropRejection }[];
}

/** The file name a desktop path ends with; both separators, because a Windows path arrives verbatim. */
export const nameOfPath = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * Decides a drop before a byte is copied: unsupported files are named rather than silently dropped, and the licence
 * answer comes from `fileIntake`, so Free keeps its single attachment instead of importing ten and refusing them one
 * by one, and Excel and HTML stay Work (§7.3 row 8).
 */
export function planDrop(entries: readonly DroppedEntry[], tier: LicenceTier, attachedCount = 0): DropPlan {
  const plan: DropPlan = { accept: [], rejected: [] };
  for (const { path, head } of entries) {
    const name = nameOfPath(path);
    /* Same sniff as the attach sheet's picker (office.sniffPicked), so a drop and a pick never disagree about a file. */
    const kind = kindOf(name, head);
    if (kind === "unknown") {
      plan.rejected.push({ name, reason: "unsupported" });
      continue;
    }
    /* One intake authority for every door (licence/intake.ts); a drop that decided for itself would be the fourth. */
    const verdict = fileIntake(tier, kind, attachedCount + plan.accept.length);
    if (verdict.kind === "paywall") plan.rejected.push({ name, reason: verdict.moment === "office" ? "work-only" : "over-free-limit" });
    else plan.accept.push({ path, name, kind });
  }
  return plan;
}
