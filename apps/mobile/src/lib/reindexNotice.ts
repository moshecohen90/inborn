/** What an answer saw: the searched documents still being rebuilt for a new embedder at the time it was retrieved. */
export interface AnsweredMidReindex {
  pending: number;
  total: number;
  ids: string[];
}

export type ReindexNotice = { kind: "pending"; pending: number; total: number } | { kind: "done" } | null;

/**
 * The line under an answer written while its documents were being rebuilt (F402). It counts only the ones still
 * rebuilding now, so it shrinks as they finish and, once none is left, says so once until the next question.
 */
export function reindexNotice(answered: AnsweredMidReindex | null, live: readonly { id: string; reindexFrom?: string }[]): ReindexNotice {
  if (!answered) return null;
  const rebuilding = new Set(live.filter((d) => d.reindexFrom).map((d) => d.id));
  const pending = answered.ids.filter((id) => rebuilding.has(id)).length;
  return pending ? { kind: "pending", pending, total: answered.total } : { kind: "done" };
}
