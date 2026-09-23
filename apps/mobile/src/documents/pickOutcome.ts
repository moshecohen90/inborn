/** What a pick ended in, for every platform (pickPlan.ts). */
export type PickOutcome = { kind: "cancelled" } | { kind: "paywall"; moment: "document" | "office" } | { kind: "error"; error: string } | { kind: "imported"; id: string };
