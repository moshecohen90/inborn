/** The only hosts the app may ever open a socket to, per platform (spec §5.1). Android: none, the store delivers. */
export const MODELS_HOST = "models.inbornapp.com";
export const HF_HOST = "huggingface.co";
/** huggingface.co answers a file download with a redirect to its CDN; the bytes come from a `*.hf.co` host. */
export const HF_CDN_HOST = "*.hf.co";

export type NetworkPlatform = "android" | "ios" | "web" | "desktop";

export interface AllowlistEntry {
  host: string;
  /** "store" = the OS/store fetches, not the app; "explicit" = only after the user taps a download. */
  when: "never" | "store" | "explicit";
}

export function networkAllowlist(platform: NetworkPlatform, iosMajor = 0): AllowlistEntry[] {
  switch (platform) {
    case "android":
      return [];
    case "ios":
      return iosMajor >= 26
        ? [
            { host: HF_HOST, when: "explicit" },
            { host: HF_CDN_HOST, when: "explicit" },
          ]
        : [
            { host: MODELS_HOST, when: "explicit" },
            { host: HF_HOST, when: "explicit" },
            { host: HF_CDN_HOST, when: "explicit" },
          ];
    case "desktop":
      return [
        { host: MODELS_HOST, when: "explicit" },
        { host: HF_HOST, when: "explicit" },
        { host: HF_CDN_HOST, when: "explicit" },
      ];
    case "web":
      return [{ host: MODELS_HOST, when: "explicit" }];
  }
}

export interface TransferRecord {
  host: string;
  bytesOut: number;
  bytesIn: number;
  at: number;
  purpose: "model" | "search" | "other";
}

/** Session network log (spec S50 "View network log"): everything the app itself transferred, in order. */
export class NetworkLog {
  private readonly records: TransferRecord[] = [];
  private readonly listeners = new Set<() => void>();

  record(r: TransferRecord): void {
    this.records.push(r);
    for (const l of this.listeners) l();
  }
  list(): readonly TransferRecord[] {
    return this.records;
  }
  totals(): { out: number; in: number; connections: number } {
    return this.records.reduce((a, r) => ({ out: a.out + r.bytesOut, in: a.in + r.bytesIn, connections: a.connections + 1 }), { out: 0, in: 0, connections: 0 });
  }
  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
