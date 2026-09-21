/**
 * The microphone module's native side is one global recorder with non-reentrant start/stop (QA F35): a start that
 * overlaps the previous teardown made the old reader thread release the recorder the new session had just created,
 * and the app died on a null `AudioRecord`. Every call goes through one queue so two sessions can never overlap.
 */
export type MicSessionState = "idle" | "starting" | "running" | "stopping";

/** Runs each task after the previous one settled, in call order; a rejection is reported to its own caller only. */
export function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * What the recorder may do next. `start` on a running session is a no-op rather than a second native start, and a
 * `stop` with nothing running never reaches the native module, which would otherwise resolve a stop it never did.
 */
export function nextMicState(state: MicSessionState, event: "start" | "started" | "stop" | "stopped" | "failed"): MicSessionState {
  switch (event) {
    case "start":
      return state === "idle" ? "starting" : state;
    case "started":
      return state === "starting" ? "running" : state;
    case "stop":
      return state === "running" || state === "starting" ? "stopping" : state;
    case "stopped":
    case "failed":
      return "idle";
  }
}

export const micShouldStart = (state: MicSessionState): boolean => state === "idle";
export const micShouldStop = (state: MicSessionState): boolean => state === "running" || state === "starting";
