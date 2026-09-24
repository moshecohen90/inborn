import { installErrorKind } from "@inborn/core";

type T = (key: string, options?: Record<string, unknown>) => string;

const KEY = { offline: "vault.error.offline", "no-space": "vault.error.noSpace", verify: "vault.error.verify", unknown: "vault.error.unknown" } as const;

/** The card's line for a failed install: one plain sentence, never the platform's exception text (F349). */
export function installFailureText(t: T, error: string, os: string, offline = false): string {
  if (offline) return t(KEY.offline);
  if (error === "no-delivery") return t(os === "android" ? "vault.state.noDelivery.android" : "vault.state.noDelivery.web");
  return t(KEY[installErrorKind(error)]);
}
