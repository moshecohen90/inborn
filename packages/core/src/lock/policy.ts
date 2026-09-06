/** App lock policy (spec §5.7, §7.5, S53): pure decisions, no platform calls. */
export type BiometricKind = "faceId" | "touchId" | "opticId" | "android" | "windowsHello" | "passcode";
export type AuthType = "fingerprint" | "facial" | "iris";
export type LockPlatform = "ios" | "macos" | "android" | "windows" | "web";

export interface BiometricProbe {
  platform: LockPlatform;
  hasHardware: boolean;
  enrolled: boolean;
  types: readonly AuthType[];
  /** Apple Vision Pro reports facial auth but the word is Optic ID. */
  visionOS?: boolean;
}

/** The label on the toggle follows the device (S53): never "Face ID" on a Touch ID phone, no brand names on Android. */
export function biometricKindFor(p: BiometricProbe): BiometricKind {
  if (!p.hasHardware || !p.enrolled || p.types.length === 0) return "passcode";
  switch (p.platform) {
    case "ios":
    case "macos":
      if (p.visionOS) return "opticId";
      if (p.types.includes("facial")) return "faceId";
      if (p.types.includes("fingerprint")) return "touchId";
      return "passcode";
    case "android":
      return "android";
    case "windows":
      return "windowsHello";
    default:
      return "passcode";
  }
}

/** Seconds; 0 = lock the moment the app leaves the foreground. */
export const LOCK_TIMEOUTS = [0, 60, 300] as const;
export type LockTimeout = (typeof LOCK_TIMEOUTS)[number];

export function shouldLock(enabled: boolean, backgroundedAt: number | null, now: number, timeoutSec: number): boolean {
  if (!enabled || backgroundedAt === null) return false;
  return now - backgroundedAt >= timeoutSec * 1000;
}

/** Panic-wipe countdown (S53): null when the feature is off, otherwise attempts left before the wipe. */
export function attemptsLeft(failed: number, wipeAfter: number | null): number | null {
  if (!wipeAfter || wipeAfter <= 0) return null;
  return Math.max(0, wipeAfter - failed);
}

/** The countdown becomes visible once fewer than three attempts remain, so a single slip never surprises. */
export function showCountdown(failed: number, wipeAfter: number | null): boolean {
  const left = attemptsLeft(failed, wipeAfter);
  return left !== null && left <= 2;
}

export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 8;
export const isValidPasscode = (code: string): boolean => /^\d+$/.test(code) && code.length >= PASSCODE_MIN && code.length <= PASSCODE_MAX;
