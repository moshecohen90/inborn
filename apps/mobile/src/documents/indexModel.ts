/** Where the document index model stands on this device, as the hold card and the Documents screen show it (round 93). */
export type IndexModelState =
  | { kind: "missing"; bytes: number }
  | { kind: "downloading"; bytes: number; total: number }
  | { kind: "ready" }
  | { kind: "failed"; error: string; bytes: number }
  /** Nothing on this platform can fetch it (a browser without OPFS, a desktop build that installs it from the vault). */
  | { kind: "unavailable" };
