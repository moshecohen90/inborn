import type { Session } from "@inborn/core";
import { createEngine, type Engine } from "./adapters";

let booted: Engine | null = null;
let session: Promise<Session> | null = null;

export function getEngine(): Engine {
  return (booted ??= createEngine());
}

/** One load per app run: screens mount and unmount, the weights stay resident (idle unload comes with §5.7). */
export function loadSession(nCtx = 4096): Promise<Session> {
  if (!session) {
    const { engine, model } = getEngine();
    session = engine.load(model, { nCtx }).catch((e: unknown) => {
      session = null;
      throw e;
    });
  }
  return session;
}
