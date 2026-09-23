/**
 * The in-app QA bridge (spec §14.4). It exists only in a build made with `EXPO_PUBLIC_QA=1`: metro.config.js
 * resolves this file to `Bridge.stub.tsx` otherwise, so a release bundle carries neither the interpreter nor the
 * file watcher — `scripts/check-ios-qa-bridge.sh` is the gate that proves it.
 */
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { ensureDirs, takeScript, writeBoot, writeProgress, writeResult } from "./io";
import { QA_BRIDGE_SENTINEL, createSurface, sleep } from "./runtime";
import { runScript } from "./steps";
import { currentRoot, dump, fiberOf } from "./tree";

const IDLE_POLL = 1000;

/** Redboxes and warnings raised while a script runs belong in that run's report, not only in the device console. */
function captureConsole(sink: string[]): () => void {
  const error = console.error;
  const warn = console.warn;
  console.error = (...args: unknown[]) => {
    sink.push(`console.error: ${args.map(String).join(" ")}`);
    error(...args);
  };
  console.warn = (...args: unknown[]) => {
    sink.push(`console.warn: ${args.map(String).join(" ")}`);
    warn(...args);
  };
  return () => {
    console.error = error;
    console.warn = warn;
  };
}

/** One line a driver can read before writing a script: is the bridge there, and can it see the tree at all. */
function reportBoot(getHandle: () => unknown): void {
  try {
    const fiber = fiberOf(getHandle());
    writeBoot({ sentinel: QA_BRIDGE_SENTINEL, fiber: !!fiber, nodes: fiber ? dump(currentRoot(fiber)).length : 0 });
  } catch (e: unknown) {
    writeBoot({ sentinel: QA_BRIDGE_SENTINEL, fiber: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function watch(getHandle: () => unknown, alive: () => boolean): Promise<void> {
  ensureDirs();
  console.info(`[qa] ${QA_BRIDGE_SENTINEL} watching Documents/qa/in`);
  await sleep(1500);
  reportBoot(getHandle);
  while (alive()) {
    let script = null;
    try {
      script = takeScript();
    } catch (e: unknown) {
      console.warn("[qa] unreadable script", e);
    }
    if (script) {
      const noise: string[] = [];
      const release = captureConsole(noise);
      try {
        writeProgress(script.runId, { state: "running", steps: script.steps.length });
        const result = await runScript(createSurface(getHandle, script.runId), script.runId, script.steps);
        writeResult(script.runId, { ...result, errors: [...result.errors, ...noise] });
        writeProgress(script.runId, { state: "done", ok: result.ok, failed: result.failed });
      } catch (e: unknown) {
        const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
        writeProgress(script.runId, { state: "crashed", detail });
      } finally {
        release();
      }
    }
    await sleep(IDLE_POLL);
  }
}

/** A zero-size anchor: its host node is the only thing the bridge needs to reach every fiber in the tree. */
export function QaBridge(): React.JSX.Element {
  const anchor = useRef<View | null>(null);
  useEffect(() => {
    let alive = true;
    void watch(() => anchor.current, () => alive);
    return () => {
      alive = false;
    };
  }, []);
  return <View ref={anchor} collapsable={false} pointerEvents="none" testID="qa-bridge" style={styles.anchor} />;
}

const styles = StyleSheet.create({ anchor: { position: "absolute", width: 0, height: 0 } });
