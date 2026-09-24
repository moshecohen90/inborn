/**
 * The native `Surface`: the step vocabulary wired to the running app. It needs no XCUITest runner, no accessibility
 * grant and no "Enable UI Automation" passcode sheet (F185) — every action is a call into the handlers React
 * already holds, found through the fiber a single mounted `View` hands over.
 */
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import { requestBytes } from "@inborn/core";
import { recordTransfer } from "../proof/transfers";
import { allowedHosts } from "../vault/httpsDelivery";
import { setEntitlements } from "../lib/entitlements";
import { getLicence } from "../licence/licence";
import { ackExists, cleanup, writeDevPrompt, writeProgress } from "./io";
import { sweepWhenAcked, type NodeValue, type ProbeResult, type ProbeSession, type Step, type Surface, type Tier } from "./steps";
import { currentRoot, dump, fiberOf, findAll, hostOf, isDisabled, pressTarget, propsOf, routeOf, scrollerOf, textOf, typeTarget, type QaFiber } from "./tree";

/** Greppable in a built `main.jsbundle`: `scripts/check-qa-bridge.sh` fails a release artifact that contains it. */
export const QA_BRIDGE_SENTINEL = "INBORN_QA_BRIDGE_V1";

/** The driver has 2 minutes to take the picture and acknowledge; longer than that is a dead driver, not a slow one. */
const SHOT_TIMEOUT = 120000;
/** The same patience for the report's acknowledgement; a driver that never comes back leaves the report behind to be read. */
const SWEEP_TIMEOUT = 120000;
const MEASURE_TIMEOUT = 3000;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const DATA_PROPS = ["value", "toggle", "label", "title", "sub", "accessibilityLabel", "accessibilityRole", "accessibilityState", "placeholder", "disabled", "editable", "selected"] as const;

function valueOf(root: QaFiber, testID: string): NodeValue | null {
  const matches = findAll(root, testID);
  const outermost = matches[0];
  if (!outermost) return null;
  const props: Record<string, unknown> = {};
  for (const fiber of matches) {
    const p = propsOf(fiber);
    for (const key of DATA_PROPS) if (key in p && typeof p[key] !== "function" && props[key] === undefined) props[key] = p[key];
  }
  props.disabled = matches.every(isDisabled);
  return { text: textOf(outermost), props };
}

function measureY(host: unknown, relativeTo: unknown, testID: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const measureLayout = (host as { measureLayout?: (rel: unknown, ok: (x: number, y: number) => void, fail?: () => void) => void }).measureLayout;
    if (typeof measureLayout !== "function") return reject(new Error(`scrollTo ${testID}: the node cannot be measured`));
    const timer = setTimeout(() => reject(new Error(`scrollTo ${testID}: measureLayout never answered`)), MEASURE_TIMEOUT);
    measureLayout.call(
      host,
      relativeTo,
      (_x, y) => {
        clearTimeout(timer);
        resolve(y);
      },
      () => {
        clearTimeout(timer);
        reject(new Error(`scrollTo ${testID}: measureLayout failed`));
      },
    );
  });
}

/**
 * The second sweep. `cleanup` runs where the script puts it, but `writeResult` recreates `Documents/qa/out/<run>/`
 * straight after the last step, so a run that asked to leave nothing behind still leaves its own report. The driver
 * acknowledges the report exactly as it acknowledges a screenshot, and only then does the namespace go.
 */
export const sweepAfterAck = (runId: string): Promise<boolean> =>
  sweepWhenAcked({ acked: () => ackExists(runId, "result"), cleanup, sleep, now: () => Date.now() }, SWEEP_TIMEOUT);

/** The same DownloadTask the vault uses, with only the session type varied, so a phone can A/B nsurlsessiond (F370). */
async function probeDownload(url: string, session: ProbeSession, seconds: number): Promise<ProbeResult> {
  const host = new URL(url).hostname;
  if (!allowedHosts().includes(host)) throw new Error(`probeDownload: ${host} is not an allowed model host`);
  const file = new File(Paths.cache, `qa-probe-${session}.bin`);
  if (file.exists) file.delete();
  let bytes = 0;
  let last = Date.now();
  const began = Date.now();
  const task = File.createDownloadTask(url, file, {
    sessionType: session,
    onProgress: ({ bytesWritten }) => {
      bytes = bytesWritten;
      last = Date.now();
    },
  });
  let stopped = false;
  const timer = setTimeout(() => {
    stopped = true;
    task.cancel();
  }, seconds * 1000);
  let complete = false;
  try {
    complete = !!(await task.downloadAsync());
  } catch (e: unknown) {
    if (!stopped) throw e;
  } finally {
    clearTimeout(timer);
    recordTransfer({ host, bytesOut: requestBytes(url), bytesIn: bytes, purpose: "model" });
    if (file.exists) file.delete();
  }
  return { bytes, ms: (bytes > 0 ? last : Date.now()) - began, complete };
}

export function createSurface(getHandle: () => unknown, runId: string): Surface {
  const root = (): QaFiber => {
    const fiber = fiberOf(getHandle());
    if (!fiber) throw new Error("the QA bridge never got a fiber: the anchor view is not mounted");
    return currentRoot(fiber);
  };
  return {
    press(testID) {
      const target = pressTarget(root(), testID);
      if (!target) {
        const mounted = findAll(root(), testID);
        throw new Error(mounted.length ? `press ${testID}: mounted but not pressable (disabled, or no handler)` : `press ${testID}: not mounted`);
      }
      target.action.run();
      return `${testID} ← ${target.action.kind}`;
    },
    type(testID, text) {
      const set = typeTarget(root(), testID);
      if (!set) throw new Error(`type ${testID}: no field with that testID takes text`);
      set(text);
    },
    read: (testID) => valueOf(root(), testID),
    screenText: () => textOf(root()),
    dump: () => dump(root()),
    async scrollTo(testID) {
      const tree = root();
      const scroller = scrollerOf(tree, testID);
      const host = hostOf(tree, testID);
      if (!scroller) throw new Error(`scrollTo ${testID}: no scroll view above it`);
      if (!host) throw new Error(`scrollTo ${testID}: not mounted`);
      const inner = scroller.getInnerViewRef ? scroller.getInnerViewRef() : null;
      const y = await measureY(host, inner, testID);
      scroller.scrollTo({ y: Math.max(0, y - 120), animated: false });
    },
    deeplink(url) {
      const path = routeOf(url);
      try {
        router.dismissAll();
      } catch {
        /* nothing was stacked */
      }
      router.replace(path as never);
    },
    async setTier(tier: Tier) {
      const manager = await getLicence();
      manager.pretendTier(tier === "free" ? null : tier);
      setEntitlements({ pro: tier !== "free" });
    },
    async screenshot(name) {
      writeProgress(runId, { awaiting: name });
      const until = Date.now() + SHOT_TIMEOUT;
      while (!ackExists(runId, name)) {
        if (Date.now() > until) throw new Error(`screenshot ${name}: the driver never acknowledged in ${SHOT_TIMEOUT / 1000} s`);
        await sleep(300);
      }
      writeProgress(runId, { awaiting: null, took: name });
    },
    devPrompt: writeDevPrompt,
    probeDownload,
    cleanup,
    sleep,
    now: () => Date.now(),
  };
}

export type { Step };
