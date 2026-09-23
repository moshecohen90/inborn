/** What a pick ended in, shared by the phone picker (importPicker.ts) and the browser one (importPicker.web.ts). */
export type PickOutcome = { kind: "cancelled" } | { kind: "paywall"; moment: "document" | "office" } | { kind: "error"; error: string } | { kind: "imported"; id: string };
