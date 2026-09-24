/** What a failed download or install means to the person holding the device; the raw text stays in the Details ledger (F349). */
export type InstallErrorKind = "offline" | "no-space" | "verify" | "unknown";

const OFFLINE = /offline|not connected|no (internet|network)|network|internet|connection (was )?lost|connection.*(refused|reset|closed)|could not connect|timed? ?out|unreachable|host|dns|NSURLErrorDomain|-100[1-9]\b|-1020\b|ENOTFOUND|ECONN|EAI_AGAIN|UnknownHostException|SocketTimeoutException|ConnectException|Failed to fetch|NetworkError/i;
const NO_SPACE = /no space|ENOSPC|out of space|disk (is )?full|storage (is )?full|not enough (free )?(space|storage)|insufficient (storage|space)|NSFileWriteOutOfSpace|QuotaExceeded|quota/i;
const VERIFY = /sha-?256|hash|checksum|verif|mismatch|does not match|corrupt|not a valid gguf|bad magic|signature/i;

export function installErrorKind(error: string): InstallErrorKind {
  if (NO_SPACE.test(error)) return "no-space";
  if (VERIFY.test(error)) return "verify";
  if (OFFLINE.test(error)) return "offline";
  return "unknown";
}
