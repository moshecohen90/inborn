import { router } from "expo-router";
import type { PaywallReason } from "@inborn/core";

/**
 * The one door to S60. Every locked tap goes through here with the reason it was refused, so the paywall can open with
 * the line that answers *that* tap (§12.3 value moments) instead of a generic pitch.
 */
export const paywallHref = (reason?: PaywallReason): string => (reason ? `/paywall?reason=${encodeURIComponent(reason)}` : "/paywall");

export const openPaywall = (reason?: PaywallReason): void => router.push(paywallHref(reason));

/** The reason carried on the route, or null when the paywall was opened from an entry point rather than a refusal. */
export function readReason(param: string | string[] | undefined, known: readonly PaywallReason[]): PaywallReason | null {
  const value = Array.isArray(param) ? param[0] : param;
  return value && (known as readonly string[]).includes(value) ? (value as PaywallReason) : null;
}
