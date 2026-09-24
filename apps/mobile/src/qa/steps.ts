/**
 * The step interpreter. It is pure with respect to the app: everything it can do arrives as a `Surface`, so the
 * whole vocabulary is unit-testable off a device. The verbs are the desktop QA socket's (apps/desktop/scripts/
 * qa-drive.mjs): press / type / wait / value / shot, one JSON line per step, one result per step.
 */

export type Tier = "free" | "pro" | "work";

export type Step =
  | { op: "press"; testID: string }
  | { op: "type"; testID: string; text: string }
  | { op: "send" }
  | { op: "waitFor"; testID?: string; text?: string; gone?: boolean; timeoutMs?: number }
  | { op: "assertText"; text: string; testID?: string; absent?: boolean }
  | { op: "value"; testID: string }
  | { op: "dump"; name?: string }
  | { op: "screenshot"; name: string }
  | { op: "scrollTo"; testID: string }
  | { op: "deeplink"; url: string }
  | { op: "setTier"; tier: Tier }
  | { op: "devPrompt"; lines: string[] }
  | { op: "sleep"; ms: number }
  | { op: "probeDownload"; url: string; session: ProbeSession; seconds?: number }
  | { op: "idleTimer"; disabled?: boolean }
  | { op: "cleanup" };

/** expo-file-system's two iOS URLSession configurations: nsurlsessiond out of process, or in the app's own process. */
export type ProbeSession = "background" | "foreground";

export interface ProbeResult {
  bytes: number;
  ms: number;
  complete: boolean;
}

export interface NodeValue {
  text: string;
  props: Record<string, unknown>;
}

/** Everything the interpreter is allowed to touch. The native runtime supplies one; a test supplies a fake. */
export interface Surface {
  press: (testID: string) => string;
  type: (testID: string, text: string) => void;
  read: (testID: string) => NodeValue | null;
  screenText: () => string;
  dump: () => unknown[];
  scrollTo: (testID: string) => Promise<void>;
  deeplink: (url: string) => void;
  setTier: (tier: Tier) => Promise<void>;
  /** Hands control to the driver, which takes the picture off the device and acknowledges. */
  screenshot: (name: string) => Promise<void>;
  /** Writes the line-based prompt file Chat.tsx already watches (`image:`, `attach:`, `strict:`, plain text). */
  devPrompt: (lines: string[]) => void;
  cleanup: () => void;
  /** Downloads `url` through one session type for at most `seconds`, then throws the bytes away. */
  probeDownload: (url: string, session: ProbeSession, seconds: number) => Promise<ProbeResult>;
  /** iOS `UIApplication.isIdleTimerDisabled`: true while the screen is kept from auto-locking. */
  idleTimerDisabled: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface StepResult {
  i: number;
  op: string;
  ok: boolean;
  ms: number;
  detail?: string;
  value?: NodeValue | null;
  nodes?: unknown[];
}

export interface RunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  passed: number;
  failed: number;
  steps: StepResult[];
  errors: string[];
}

const DEFAULT_WAIT = 30000;
const POLL = 250;
/** React commits on a later tick, so nothing is read back in the same turn that changed it. */
const SETTLE = 150;

const PROBE_SECONDS = 20;
const PROBE_MAX_SECONDS = 600;

async function probeDownload(surface: Surface, step: Extract<Step, { op: "probeDownload" }>): Promise<Partial<StepResult>> {
  const seconds = step.seconds ?? PROBE_SECONDS;
  if (step.session !== "background" && step.session !== "foreground") throw new Error(`probeDownload: session must be background or foreground, not ${JSON.stringify(step.session)}`);
  if (!(seconds >= 1 && seconds <= PROBE_MAX_SECONDS)) throw new Error(`probeDownload: seconds must be 1..${PROBE_MAX_SECONDS}, not ${seconds}`);
  const r = await surface.probeDownload(step.url, step.session, seconds);
  if (r.bytes <= 0) throw new Error(`probeDownload: ${step.session} moved no bytes in ${r.ms} ms`);
  const mb = (r.bytes / 1e6 / (Math.max(1, r.ms) / 1000)).toFixed(2);
  const detail = `${step.session} ${mb} MB/s · ${r.bytes} B in ${r.ms} ms${r.complete ? " · complete" : ""}`;
  return { detail, value: { text: detail, props: { session: step.session, bytes: r.bytes, ms: r.ms, mbps: Number(mb), complete: r.complete } } };
}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** `waitFor` polls the committed tree; nothing here sleeps longer than one poll, so a timeout is honest to ±250 ms. */
async function waitFor(surface: Surface, step: Extract<Step, { op: "waitFor" }>): Promise<string> {
  const timeout = step.timeoutMs ?? DEFAULT_WAIT;
  const until = surface.now() + timeout;
  const want = step.gone !== true;
  for (;;) {
    const there = step.testID ? surface.read(step.testID) !== null : norm(surface.screenText()).includes(norm(step.text ?? ""));
    if (there === want) return `${step.testID ?? step.text} ${want ? "appeared" : "gone"}`;
    if (surface.now() >= until) throw new Error(`waitFor ${step.testID ?? JSON.stringify(step.text)} ${want ? "never appeared" : "never went away"} in ${timeout} ms`);
    await surface.sleep(POLL);
  }
}

async function runStep(surface: Surface, step: Step): Promise<Partial<StepResult>> {
  switch (step.op) {
    case "press": {
      const detail = surface.press(step.testID);
      await surface.sleep(SETTLE);
      return { detail };
    }
    case "send": {
      const detail = surface.press("send");
      await surface.sleep(SETTLE);
      return { detail };
    }
    case "type": {
      surface.type(step.testID, step.text);
      await surface.sleep(SETTLE);
      const after = surface.read(step.testID);
      if (after && typeof after.props.value === "string" && after.props.value !== step.text) throw new Error(`type ${step.testID}: field holds ${JSON.stringify(after.props.value)} after the change`);
      return { detail: `${step.testID} = ${step.text.length} chars` };
    }
    case "waitFor":
      return { detail: await waitFor(surface, step) };
    case "assertText": {
      const haystack = step.testID ? (surface.read(step.testID)?.text ?? "") : surface.screenText();
      const there = norm(haystack).includes(norm(step.text));
      if (there === (step.absent === true)) throw new Error(`assertText ${JSON.stringify(step.text)} ${step.absent ? "is on screen and should not be" : "is not on screen"}${step.testID ? ` under ${step.testID}` : ""}`);
      return { detail: `${JSON.stringify(step.text)} ${step.absent ? "absent" : "present"}` };
    }
    case "value": {
      const value = surface.read(step.testID);
      if (!value) throw new Error(`value ${step.testID}: no node with that testID is mounted`);
      return { value, detail: value.text.slice(0, 200) };
    }
    case "dump":
      return { nodes: surface.dump(), detail: step.name ?? "tree" };
    case "screenshot":
      await surface.screenshot(step.name);
      return { detail: step.name };
    case "scrollTo":
      await surface.scrollTo(step.testID);
      return { detail: step.testID };
    case "deeplink":
      surface.deeplink(step.url);
      await surface.sleep(SETTLE);
      return { detail: step.url };
    case "setTier":
      await surface.setTier(step.tier);
      await surface.sleep(SETTLE);
      return { detail: step.tier };
    case "devPrompt":
      surface.devPrompt(step.lines);
      await surface.sleep(SETTLE);
      return { detail: step.lines.join(" | ") };
    case "sleep":
      await surface.sleep(step.ms);
      return { detail: `${step.ms} ms` };
    case "probeDownload":
      return probeDownload(surface, step);
    case "idleTimer": {
      const disabled = await surface.idleTimerDisabled();
      if (step.disabled !== undefined && disabled !== step.disabled) throw new Error(`idleTimer: auto-lock is ${disabled ? "off" : "on"}, expected ${step.disabled ? "off" : "on"}`);
      return { detail: `idle timer disabled: ${disabled}`, value: { text: String(disabled), props: { idleTimerDisabled: disabled } } };
    }
    case "cleanup":
      surface.cleanup();
      return { detail: "qa namespace removed" };
  }
}

/**
 * Whether the run has to sweep again once the driver has the report. `cleanup` drops `Documents/qa/`, but the
 * result file is written into that same namespace after the last step, so a script that ends in `cleanup` still
 * leaves its own report on the device. The second sweep waits for the driver's acknowledgement and takes it away.
 */
export const needsSweep = (steps: Step[]): boolean => steps.some((s) => s.op === "cleanup");

/** What the second sweep is allowed to touch: the driver's acknowledgement, the delete, and the clock. */
export interface Sweep {
  acked: () => boolean;
  cleanup: () => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/**
 * Deletes the namespace once the driver says it has the report, and gives up rather than deleting a report nobody
 * read: a driver that never comes back has left a run to be diagnosed, and the evidence is worth more than a tidy
 * container.
 */
export async function sweepWhenAcked(sweep: Sweep, timeoutMs: number, pollMs = 500): Promise<boolean> {
  const until = sweep.now() + timeoutMs;
  while (!sweep.acked()) {
    if (sweep.now() > until) return false;
    await sweep.sleep(pollMs);
  }
  sweep.cleanup();
  return true;
}

/**
 * Runs every step and never stops at the first red: a device session is expensive, so the report says which rows
 * passed and which failed rather than only where it died.
 */
export async function runScript(surface: Surface, runId: string, steps: Step[]): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const results: StepResult[] = [];
  const errors: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const began = surface.now();
    try {
      const out = await runStep(surface, step);
      results.push({ i, op: step.op, ok: true, ms: surface.now() - began, ...out });
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      results.push({ i, op: step.op, ok: false, ms: surface.now() - began, detail });
      errors.push(`step ${i} (${step.op}): ${detail}`);
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  return { runId, startedAt, finishedAt: new Date().toISOString(), ok: failed === 0, passed: results.length - failed, failed, steps: results, errors };
}
