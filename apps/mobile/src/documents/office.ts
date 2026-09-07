import { kindOf, type DocKind, type LicenceTier, can } from "@inborn/core";
import { readHead } from "./files";

/** Office intake (spec §7.3 row 8, §7.9): Excel and HTML are Work; a Word file stays the Free single attachment of row 1. */
export const WORK_KINDS: readonly DocKind[] = ["xlsx", "html"];

export const isWorkKind = (kind: DocKind): boolean => WORK_KINDS.includes(kind);

/** What the system picker offers, by MIME; the kind is decided afterwards from the name and the first bytes. */
export const PICK_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/xhtml+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
];

/** Kind of a picked file before it is copied in, so a locked kind never enters the library. */
export function sniffPicked(uri: string, name: string): DocKind {
  return kindOf(name, readHead(uri, 64));
}

/** The value moment: a Free or Pro user picked an Excel or HTML file. */
export function officeLocked(tier: LicenceTier, kind: DocKind): boolean {
  return isWorkKind(kind) && !can(tier, "officeIngest");
}
