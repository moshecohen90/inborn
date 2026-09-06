import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionErrorCode } from "expo-speech-recognition";
import { normalizeLocale } from "@inborn/core";

/**
 * System dictation (spec §7.4 free tier, §5.6): the OS recogniser with the on-device flag forced on.
 * - iOS: `requiresOnDeviceRecognition` makes SFSpeechRecognizer refuse to use the server (iOS 13+); the locale must be
 *   in `supportsOnDeviceRecognition` for that recogniser or start() errors out.
 * - Android 13+: `createOnDeviceSpeechRecognizer` + `EXTRA_PREFER_OFFLINE`, service `com.google.android.as`; the
 *   locale's offline pack must be installed (`installedLocales`), otherwise Google's service would try the network,
 *   so the app refuses to start and offers the system's own pack download instead.
 * - Android 12 and below, and the web (browsers stream audio to a server): unavailable; Pro whisper covers them.
 */
/* Android also reports "client" (the on-device service has no pack for the locale), "speech-timeout", "too-many-requests", "unknown". */
export type DictationErrorCode = ExpoSpeechRecognitionErrorCode | "client" | "speech-timeout" | "too-many-requests" | "unknown" | "offline-model-missing" | "unsupported";

export interface DictationHandle {
  /** Ends the session and asks for the final result. */
  stop(): void;
  /** Ends the session without a final result. */
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
  /** Android: the pack for this locale can be fetched by the system (Android 13+). */
  canInstallOffline: boolean;
}

const ANDROID_ON_DEVICE_SERVICE = "com.google.android.as";
const androidSupported = Platform.OS === "android" && (Platform.Version as number) >= 33;

export const systemDictationSupported = (): boolean => Platform.OS === "ios" || androidSupported;

export async function systemDictationStatus(locale: string): Promise<SystemDictationStatus> {
  const none: SystemDictationStatus = { available: false, onDevice: false, installedLocales: [], canInstallOffline: false };
  if (!systemDictationSupported()) return none;
  try {
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    const onDeviceEngine = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    if (!available || !onDeviceEngine) return { ...none, available, canInstallOffline: androidSupported };
    const want = normalizeLocale(locale).toLowerCase();
    const wantLang = want.split("-")[0]!;
    const { installedLocales, locales } = await ExpoSpeechRecognitionModule.getSupportedLocales(Platform.OS === "android" ? { androidRecognitionServicePackage: ANDROID_ON_DEVICE_SERVICE } : {});
    const norm = (l: string) => l.replace("_", "-").toLowerCase();
    /* iOS lists on-device locales as installed for the recogniser it can run locally; Android lists downloaded packs. */
    const pool = Platform.OS === "ios" ? (installedLocales.length ? installedLocales : locales) : installedLocales;
    const onDevice = pool.some((l) => norm(l) === want) || pool.some((l) => norm(l).split("-")[0] === wantLang);
    return { available, onDevice, installedLocales: pool, canInstallOffline: androidSupported && locales.some((l) => norm(l).split("-")[0] === wantLang) };
  } catch (e: unknown) {
    console.warn("[voice] dictation status", e);
    return { ...none, canInstallOffline: androidSupported };
  }
}

export async function requestMicPermission(): Promise<boolean> {
  const r = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
  return r.granted;
}

export async function requestDictationPermission(): Promise<boolean> {
  const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return r.granted;
}

/** Android 13+: opens the system's offline-pack download (Google's download, like a Play asset; the app opens no socket). */
export async function installOfflineDictation(locale: string): Promise<"opened" | "done" | "scheduled" | "unsupported"> {
  if (!androidSupported) return "unsupported";
  const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: normalizeLocale(locale) });
  return r.status === "download_success" ? "done" : r.status === "download_scheduled" ? "scheduled" : "opened";
}

export function startSystemDictation(locale: string, cb: DictationCallbacks): DictationHandle {
  const subs = [
    ExpoSpeechRecognitionModule.addListener("result", (e) => {
      const text = e.results[0]?.transcript ?? "";
      if (e.isFinal) cb.onFinal(text);
      else cb.onInterim(text);
    }),
    ExpoSpeechRecognitionModule.addListener("error", (e) => cb.onError(e.error, e.message)),
    ExpoSpeechRecognitionModule.addListener("end", () => {
      for (const s of subs) s.remove();
      cb.onEnd();
    }),
  ];
  ExpoSpeechRecognitionModule.start({
    lang: normalizeLocale(locale),
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    addsPunctuation: true,
    /* The one non-negotiable flag (spec §7.4 "on-device flag mandatory"). */
    requiresOnDeviceRecognition: true,
    ...(Platform.OS === "android" ? { androidRecognitionServicePackage: ANDROID_ON_DEVICE_SERVICE, androidIntentOptions: { EXTRA_LANGUAGE_MODEL: "free_form" as const } } : { iosTaskHint: "dictation" as const }),
  });
  return {
    stop: () => ExpoSpeechRecognitionModule.stop(),
    abort: () => ExpoSpeechRecognitionModule.abort(),
  };
}
