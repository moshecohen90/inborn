import { WORK_DOC_KINDS, isWorkKind, kindOf, pickedFileName, type DocKind, type LicenceTier, can } from "@inborn/core";
import { contentMeta } from "../../modules/share-target";
import { readHead } from "./files";

/** Office intake (spec §7.3 row 8, §7.9): Excel and HTML are Work; a Word file stays the Free single attachment of row 1. */
export const WORK_KINDS = WORK_DOC_KINDS;

export { isWorkKind };

export { PICK_TYPES } from "./pickTypes";

/** Kind of a picked file before it is copied in, so a locked kind never enters the library. */
export function sniffPicked(uri: string, name: string): DocKind {
  return kindOf(name, readHead(uri, 64));
}

/**
 * The picked file's real name (QA F3): Android's SAF picker returns a content:// URI whose last segment is an id
 * ("document:1000000028"), so the provider is asked for the display name and MIME type; the magic bytes are the last resort.
 */
export function pickedName(uri: string, uriName: string | undefined): string {
  const meta = contentMeta(uri);
  return pickedFileName({ uriName: uriName ?? "", displayName: meta?.name, mimeType: meta?.mimeType, head: readHead(uri, 64) });
}

/**
 * The name of a file another app shared in (§7.7). The sender supplies the name and the MIME type instead of a content
 * provider; without an extension `.xlsx` and `.docx` are the same zip header and the Work gate would read the file as
 * unknown (QA F72).
 */
export function sharedName(uri: string, name: string, mimeType?: string | null): string {
  return pickedFileName({ uriName: name, displayName: name, mimeType, head: readHead(uri, 64) });
}

/** The value moment: a Free or Pro user picked an Excel or HTML file. */
export function officeLocked(tier: LicenceTier, kind: DocKind): boolean {
  return isWorkKind(kind) && !can(tier, "officeIngest");
}
