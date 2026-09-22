import type { DocKind } from "@inborn/core";

/** Office intake (spec §7.3 row 8, §7.9): Excel and HTML are Work; a Word file stays the Free single attachment of row 1. */
export const WORK_KINDS: readonly DocKind[] = ["xlsx", "html"];

export const isWorkKind = (kind: DocKind): boolean => WORK_KINDS.includes(kind);
