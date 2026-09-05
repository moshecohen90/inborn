import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { shouldLock, type BiometricKind } from "@inborn/core";
import type { LockPrefs } from "../services/prefsTypes";
import { authenticate, detectBiometricKind } from "./biometrics";
import { clearPasscode, hasPasscode, setPasscode, verifyPasscode } from "./passcode";

export interface AppLock {
  kind: BiometricKind;
  ready: boolean;
  locked: boolean;
  /** True while the app is not in the foreground (switcher, notification shade): the privacy cover shows. */
  covered: boolean;
  failed: number;
  passcodeSet: boolean;
  lockNow(): void;
  /** Biometric prompt; resolves true when unlocked. */
  unlock(prompt: string, cancel: string): Promise<boolean>;
  unlockWithPasscode(code: string): Promise<boolean>;
  setPasscode(code: string): Promise<void>;
  clearPasscode(): Promise<void>;
}

interface Options {
  prefs: LockPrefs;
  onWipe: () => void;
}

/** Lock state machine (spec §5.7, S53): locks on cold start and after the timeout in the background. */
export function useAppLock({ prefs, onWipe }: Options): AppLock {
  const [kind, setKind] = useState<BiometricKind>("passcode");
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(prefs.enabled);
  const [covered, setCovered] = useState(false);
  const [failed, setFailed] = useState(0);
  const [passcodeSet, setPasscodeSet] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const wipeRef = useRef(onWipe);
  wipeRef.current = onWipe;

  useEffect(() => {
    let alive = true;
    Promise.all([detectBiometricKind(), hasPasscode()]).then(([k, has]) => {
      if (!alive) return;
      setKind(k);
      setPasscodeSet(has);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!prefs.enabled) setLocked(false);
  }, [prefs.enabled]);

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") {
        const p = prefsRef.current;
        if (shouldLock(p.enabled, backgroundedAt.current, Date.now(), p.timeoutSec)) setLocked(true);
        backgroundedAt.current = null;
        setCovered(false);
      } else {
        // "inactive" also fires for the Face ID sheet and system alerts; only a real background counts as leaving.
        if (s === "background") backgroundedAt.current ??= Date.now();
        setCovered(true);
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  const noteFailure = useCallback(() => {
    setFailed((n) => {
      const next = n + 1;
      const limit = prefsRef.current.wipeAfterFailed;
      if (limit && next >= limit) {
        wipeRef.current();
        return 0;
      }
      return next;
    });
  }, []);

  const unlock = useCallback(
    async (prompt: string, cancel: string) => {
      const outcome = await authenticate(prompt, cancel);
      if (outcome === "success") {
        setLocked(false);
        setFailed(0);
        return true;
      }
      if (outcome === "failed") noteFailure();
      return false;
    },
    [noteFailure],
  );

  const unlockWithPasscode = useCallback(
    async (code: string) => {
      if (await verifyPasscode(code)) {
        setLocked(false);
        setFailed(0);
        return true;
      }
      noteFailure();
      return false;
    },
    [noteFailure],
  );

  return useMemo<AppLock>(
    () => ({
      kind,
      ready,
      locked,
      covered,
      failed,
      passcodeSet,
      lockNow: () => setLocked(true),
      unlock,
      unlockWithPasscode,
      setPasscode: async (code) => {
        await setPasscode(code);
        setPasscodeSet(true);
      },
      clearPasscode: async () => {
        await clearPasscode();
        setPasscodeSet(false);
      },
    }),
    [kind, ready, locked, covered, failed, passcodeSet, unlock, unlockWithPasscode],
  );
}
