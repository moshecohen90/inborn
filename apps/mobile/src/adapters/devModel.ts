import type { Engine } from "./index";

/** Type-level default: phones resolve devModel.native.ts (llama.rn), browsers devModel.web.ts (wllama). */
export function devModelEngine(): Engine | null {
  return null;
}

export const prepareDevModel = (): Promise<void> => Promise.resolve();

export function writeDevResult(_result: Record<string, unknown>): void {}
