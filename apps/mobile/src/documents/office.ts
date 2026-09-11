import { kindOf, type DocKind, type LicenceTier, can } from "@inborn/core";
import { readHead } from "./files";

/** Office intake (spec §7.3 row 8, §7.9): Excel and HTML are Work; a Word file stays the Free single attachment of row 1. */
export const WORK_KINDS: readonly DocKind[] = ["xlsx", "html"];

export const isWorkKind = (kind: DocKind): boolean => WORK_KINDS.includes(kind);

export { PICK_TYPES } from "./pickTypes";

/** Kind of a picked file before it is copied in, so a locked kind never enters the library. */
export function sniffPicked(uri: string, name: string): DocKind {
  return kindOf(name, readHead(uri, 64));
}

/** The value moment: a Free or Pro user picked an Excel or HTML file. */
export function officeLocked(tier: LicenceTier, kind: DocKind): boolean {
  return isWorkKind(kind) && !can(tier, "officeIngest");
}
