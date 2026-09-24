/** What a pick ended in, for every platform (pickPlan.ts). */
export type PickOutcome = { kind: "cancelled" } | { kind: "paywall"; moment: "document" | "office" } | { kind: "error"; error: string } | { kind: "imported"; id: string }
  /** A picture came through the file door: it goes to the photo path, never into the document index (QA F343). */
  | { kind: "photo"; uri: string; name: string };
