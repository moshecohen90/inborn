/* Web / desktop: the Web Speech API sends audio to a vendor server, which the product rules forbid (spec §5.1). */
export type DictationErrorCode = "unsupported" | "aborted" | "audio-capture" | "interrupted" | "bad-grammar" | "language-not-supported" | "network" | "no-speech" | "not-allowed" | "service-not-allowed" | "busy" | "client" | "speech-timeout" | "too-many-requests" | "unknown" | "offline-model-missing";

export interface DictationHandle {
  stop(): void;
  abort(): void;
}

export interface DictationCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd: () => void;
  onError: (code: DictationErrorCode, message: string) => void;
}

export interface SystemDictationStatus {
  available: boolean;
  onDevice: boolean;
  installedLocales: string[];
  canInstallOffline: boolean;
}

export const systemDictationSupported = (): boolean => false;
export async function systemDictationStatus(_locale: string): Promise<SystemDictationStatus> {
  return { available: false, onDevice: false, installedLocales: [], canInstallOffline: false };
}
export async function requestMicPermission(): Promise<boolean> {
  return false;
}
export async function requestDictationPermission(): Promise<boolean> {
  return false;
}
export async function installOfflineDictation(_locale: string): Promise<"opened" | "done" | "scheduled" | "unsupported"> {
  return "unsupported";
}
export function startSystemDictation(_locale: string, cb: DictationCallbacks): DictationHandle {
  setTimeout(() => cb.onError("unsupported", "unsupported"), 0);
  return { stop: () => undefined, abort: () => undefined };
}
