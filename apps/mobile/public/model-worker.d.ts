/** Types for the unbundled worker module (model-worker.js); the app only imports it in tests. */
export interface Sha256State {
  h: number[];
  buf: number[];
  total: number;
}
export interface Sha256 {
  update(bytes: Uint8Array): void;
  hex(): string;
  exportState(): Sha256State;
  importState(state: Sha256State): void;
  reset(): void;
}
export function createSha256(): Sha256;
export function planResponse(have: number, status: number, contentRange: string | null, contentLength: string | null): { restart: boolean; total: number | null };
export function metaName(file: string): string;
export function stateName(file: string): string;
export interface DownloadJob {
  url: string;
  file: string;
  bytes?: number;
  sha256?: string;
}
export type WorkerMessage =
  | { type: "progress"; have: number; total: number | null }
  | { type: "done"; have: number; sha256: string; verified: boolean }
  | { type: "paused"; have: number }
  | { type: "error"; message: string };
export function awaitPublished(dir: FileSystemDirectoryHandle, file: string, bytes: number, tries?: number, delayMs?: number): Promise<boolean>;
export function download(job: DownloadJob, post: (m: WorkerMessage) => void, signal: AbortSignal): Promise<void>;
