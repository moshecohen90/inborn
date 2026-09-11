import type { DocumentRecord } from "@inborn/core";

/** A document already in the library with the same content (hash + size), whatever its index state: the same bytes fail or index the same way. */
export function findDuplicate(docs: Iterable<DocumentRecord>, sha256: string, bytes: number): DocumentRecord | null {
  for (const d of docs) if (d.sha256 === sha256 && d.bytes === bytes) return d;
  return null;
}
