import type { SharePayload } from "@inborn/core";

/** Web: no share target (spec §7.7 is a phone feature). */
export function useShareTarget(_onShare: (payload: SharePayload) => void): void {}

export const finishProcessText = (_text: string | null): boolean => false;
export const canReplaceProcessText = (): boolean => false;
