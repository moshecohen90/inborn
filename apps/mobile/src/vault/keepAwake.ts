import { Platform } from "react-native";
import type { InstallEvent } from "@inborn/core";

export const DOWNLOAD_AWAKE_TAG = "inborn-model-download";

export interface AwakeNative {
  activate: (tag: string) => Promise<void>;
  deactivate: (tag: string) => Promise<void>;
}

/**
 * Holds the screen awake while any model moves bytes. On iOS the auto-lock backgrounds the app and the in-process
 * download parks (F370), so a user who puts the phone down would come back to a paused 1.28 GB file.
 */
export class DownloadAwake {
  private held = new Set<string>();

  constructor(private readonly native: AwakeNative | null) {}

  get active(): boolean {
    return this.held.size > 0;
  }

  hold(id: string): void {
    if (!this.native || this.held.has(id)) return;
    this.held.add(id);
    if (this.held.size === 1) void this.native.activate(DOWNLOAD_AWAKE_TAG).catch(() => undefined);
  }

  release(id: string): void {
    if (!this.native || !this.held.delete(id)) return;
    if (this.held.size === 0) void this.native.deactivate(DOWNLOAD_AWAKE_TAG).catch(() => undefined);
  }

  releaseAll(): void {
    for (const id of [...this.held]) this.release(id);
  }

  /** Bytes moving holds; a wait on Wi-Fi or on the user's confirmation lets the screen sleep again. */
  onEvent(id: string, e: InstallEvent): void {
    if (e.type === "progress" || e.type === "resumed") this.hold(id);
    else if (e.type === "waiting-for-wifi" || e.type === "needs-confirmation") this.release(id);
  }
}

/* Loaded on first use so the vault store stays importable where no native module exists (unit tests). */
let loaded: Promise<typeof import("expo-keep-awake")> | null = null;
const load = (): Promise<typeof import("expo-keep-awake")> => (loaded ??= import("expo-keep-awake"));
const expoKeepAwake: AwakeNative = {
  activate: async (tag) => (await load()).activateKeepAwakeAsync(tag),
  deactivate: async (tag) => (await load()).deactivateKeepAwake(tag),
};

export const downloadAwake = new DownloadAwake(Platform.OS === "web" ? null : expoKeepAwake);
