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

export function formatModelBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
