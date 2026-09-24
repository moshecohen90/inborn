/** Resume logic for HTTPS deliveries (spec §5.4, §10.1 #2/#4/#5). Pure; the platform downloader applies the plan. */
export interface PartialFile {
  url: string;
  bytes: number;
  etag?: string;
  total?: number;
}

export interface RemoteInfo {
  total: number;
  etag?: string;
  acceptRanges: boolean;
}

export type ResumePlan =
  | { action: "done" }
  | { action: "restart"; reason: "no-ranges" | "changed" | "overrun" | "size-mismatch" }
  | { action: "resume"; start: number; headers: Record<string, string> };

/** What to send for a file that is `partial.bytes` long on disk. Any doubt about identity restarts from zero. */
export function resumePlan(partial: PartialFile | null, remote: RemoteInfo): ResumePlan {
  if (!partial || partial.bytes <= 0) return { action: "resume", start: 0, headers: {} };
  if (partial.total !== undefined && partial.total !== remote.total) return { action: "restart", reason: "size-mismatch" };
  if (partial.etag && remote.etag && partial.etag !== remote.etag) return { action: "restart", reason: "changed" };
  if (partial.bytes > remote.total) return { action: "restart", reason: "overrun" };
  if (partial.bytes === remote.total) return { action: "done" };
  if (!remote.acceptRanges) return { action: "restart", reason: "no-ranges" };
  const headers: Record<string, string> = { Range: `bytes=${partial.bytes}-` };
  if (remote.etag) headers["If-Range"] = remote.etag;
  return { action: "resume", start: partial.bytes, headers };
}

/** A 206 must continue exactly where the file ends; a 200 to a Range request means the server restarted the body. */
export function acceptsResume(status: number, contentRange: string | null, start: number): boolean {
  if (start === 0) return status === 200;
  if (status !== 206) return false;
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange ?? "");
  return !!m && Number(m[1]) === start;
}

export interface SpaceCheck {
  ok: boolean;
  requiredBytes: number;
  shortByBytes: number;
}

export function checkSpace(requiredBytes: number, freeBytes: number): SpaceCheck {
  return { ok: freeBytes >= requiredBytes, requiredBytes, shortByBytes: Math.max(0, requiredBytes - freeBytes) };
}

export type NetworkKind = "wifi" | "cellular" | "ethernet" | "none" | "unknown";
export const WIFI_ONLY_ABOVE_BYTES = 100 * 1024 * 1024;

/** Cellular waits for Wi-Fi above 100 MB unless the user opted out (§10.1 #4); no network always waits. */
export function shouldWait(bytes: number, network: NetworkKind, wifiOnly: boolean): boolean {
  if (network === "none") return true;
  if (network === "cellular" || network === "unknown") return wifiOnly && bytes > WIFI_ONLY_ABOVE_BYTES;
  return false;
}

/** Exponential backoff for retries after a dropped connection (§10.1 #2): 2s, 4s, 8s … capped at 60s. */
export const backoffMs = (attempt: number): number => Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt));

/** "533 MB", "1.28 GB": decimal throughout, one place every screen shares (the catalog itself quotes decimal, spec §6.1) — a binary (1024-based) reading here is what made the download door and the model card print two different sizes for one file (F281), and a screen that called this while another rolled its own rounding printed a third (F376). Two decimals under 10 GB so "1.28" and "1.3" are never both on screen for the same file. */
export function formatModelBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 10e9 ? 0 : 2)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`;
  return `${Math.round(bytes)} B`;
}

/**
 * The one download-progress percent every surface shares (F376): floor, never round, so it never claims 100%
 * before the last byte is in, and never disagrees with a sibling readout of the same two byte counts.
 */
export function downloadPercent(receivedBytes: number, totalBytes: number): number {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
  if (receivedBytes >= totalBytes) return 100;
  return Math.max(0, Math.min(99, Math.floor((receivedBytes / totalBytes) * 100)));
}
