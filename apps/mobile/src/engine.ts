import type { Session } from "@inborn/core";
import { createEngine, type Engine } from "./adapters";
import { getVault } from "./vault/store";

let booted: Engine | null = null;
let session: Promise<Session> | null = null;

export function getEngine(): Engine {
  return (booted ??= createEngine());
}

/** One load per app run: screens mount and unmount, the weights stay resident (idle unload comes with §5.7). */
export function loadSession(nCtx = 4096): Promise<Session> {
  if (!session) {
    const { engine, model } = getEngine();
    const vault = getVault();
    /* A crash inside load() leaves the "loading" mark on disk, which quarantines the file at next boot (§10.1 #8). */
    vault.markLoading(model.id, true);
    session = engine
      .load(model, { nCtx })
      .then((s) => {
        vault.markLoading(model.id, false);
        return s;
      })
      .catch((e: unknown) => {
        session = null;
        throw e;
      });
  }
  return session;
}

/** After the vault switches the default model: unload the current engine so the next loadSession() picks the new file. */
export async function resetEngine(): Promise<void> {
  const previous = booted;
  booted = null;
  session = null;
  await previous?.engine.unload().catch((e: unknown) => console.warn("[inborn] unload", e));
}
